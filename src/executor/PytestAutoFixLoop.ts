import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { EnvironmentHealer } from '../env/EnvironmentHealer';
import { PythonEnvironmentHealer } from '../env/PythonEnvironmentHealer';
import { EnvironmentIssue, AutoFixAction } from '../models/EnvironmentModels';
import { execAsync } from '../utils/execUtils';
import logger from '../utils/logger';
import path from 'path';
import { OpenRouterClient } from '../llm/OpenRouterClient';
import { findFiles, readFile, writeFile } from '../utils/fileUtils';
import { LLMMessage } from '../models/LLMMessage';

/**
 * Implements iterative auto-fix healing loop for Pytest
 * Keeps trying to fix issues until tests run or hard blocker is reached
 */
export class PytestAutoFixLoop {
    private maxIterations: number = 5;

    /**
     * Execute Pytest with auto-fix loop
     * Returns when tests run successfully or hard blocker is reached
     */
    async executeWithAutoFix(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        generatedFiles: string[]
    ): Promise<{
        success: boolean;
        attempts: number;
        finalIssues: EnvironmentIssue[];
        finalActions: AutoFixAction[];
        hardBlocker?: string;
    }> {
        let attempts = 0;
        let lastError: string = '';

        logger.info(`🔄 Starting Pytest auto-fix loop for ${project.name}`);

        while (attempts < this.maxIterations) {
            attempts++;
            logger.info(`\n📍 Attempt ${attempts}/${this.maxIterations}`);

            // Step 1: Try to run Pytest
            try {
                logger.info('🧪 Attempting to run Pytest...');

                // Determine command (use venv if available)
                // We assume the adapter or healer has already set up the environment, 
                // but we need to know how to invoke pytest.
                // For now, let's try to use the venv python/pytest if it exists, else global.
                // Actually, TestExecutor usually handles the command. 
                // But here we are running it ourselves to capture output and loop.
                // We should probably ask the Adapter, but for now let's hardcode standard venv usage.

                let cmd = 'pytest';
                // Check if we are in a venv
                // If .venv exists, use .venv/bin/pytest
                // But we need to be careful about OS (linux is assumed).

                // Better: use 'python -m pytest' which is more robust if venv is activated or using full path
                // If .venv exists, use .venv/bin/python -m pytest

                let pythonCmd = 'python3';
                // We can check if .venv exists
                // But let's rely on the Healer to have created it if needed.
                // If the healer created it, we should use it.

                // Simple check for venv
                // We can't use `fs` here directly without import, but we can use `execAsync` to check or just try.
                // Let's assume standard .venv structure for Linux.

                const venvPython = path.join('.venv', 'bin', 'python');
                // We can try to check if it exists via `test -f`
                try {
                    await execAsync(`test -f "${path.join(projectPath, venvPython)}"`);
                    pythonCmd = venvPython;
                } catch {
                    // Fallback to python3
                }

                cmd = `${pythonCmd} -m pytest`;

                const { stdout, stderr } = await execAsync(`cd "${projectPath}" && ${cmd}`, {
                    timeout: 60000
                });

                // Check if tests were actually discovered and run
                if (this.testsWereFound(stdout, stderr)) {
                    logger.info('✅ Pytest tests discovered and executed successfully!');
                    return {
                        success: true,
                        attempts,
                        finalIssues: healer.getIssues(),
                        finalActions: healer.getActions()
                    };
                }

                // Tests not found - analyze and fix
                logger.warn('⚠️  Tests exist but were not discovered by Pytest');
                await this.fixTestDiscovery(project, projectPath, healer, stdout + stderr);

            } catch (error: any) {
                lastError = error.message || String(error);
                const output = (error.stdout || '') + (error.stderr || '');

                logger.warn(`⚠️  Pytest execution failed: ${lastError.substring(0, 100)}...`);

                // Analyze error and attempt fix
                const issueType = this.analyzePytestError(output);
                logger.info(`🔍 Detected issue type: ${issueType}`);

                const fixed = await this.attemptFix(issueType, project, projectPath, healer, output);
                if (!fixed) {
                    return {
                        success: false,
                        attempts,
                        finalIssues: healer.getIssues(),
                        finalActions: healer.getActions(),
                        hardBlocker: `Failed to fix ${issueType}: ${lastError || 'Unknown error'}`
                    };
                }
            }

            // Re-analyze environment after fixes
            await healer.analyze(project, projectPath, generatedFiles);

            // Apply any new fixes discovered
            await healer.heal(projectPath);
        }

        // Max iterations reached
        return {
            success: false,
            attempts,
            finalIssues: healer.getIssues(),
            finalActions: healer.getActions(),
            hardBlocker: `Max iterations (${this.maxIterations}) reached. Last error: ${lastError}`
        };
    }

    /**
     * Check if Pytest actually found and ran tests
     */
    private testsWereFound(stdout: string, stderr: string): boolean {
        const output = stdout + stderr;

        // Positive indicators
        if (output.match(/passed/i) && output.match(/in \d+\.\d+s/)) return true;
        if (output.match(/collected \d+ items/i) && !output.match(/collected 0 items/i)) {
            // If collected items but failed, it's still "found". 
            // But we want "success" here? 
            // No, executeWithAutoFix returns success if it *ran*. 
            // If it ran and failed assertions, that's a "success" for the environment healer loop (it healed the environment).
            // The actual test failures are handled by the caller.
            return true;
        }

        // Negative indicators
        if (output.match(/collected 0 items/i)) return false;
        if (output.match(/no tests ran/i)) return false;
        if (output.match(/NO_TESTS_FOUND/i)) return false;

        // Default: assume tests ran if no error thrown (but usually pytest throws error on failure)
        return !output.match(/Error|Failed|ModuleNotFoundError/i);
    }

    /**
     * Analyze Pytest error to determine issue type
     */
    private analyzePytestError(output: string): string {
        if (output.match(/collected 0 items/i)) return 'NO_TESTS_FOUND';
        if (output.match(/ValidationError/i) && output.match(/pydantic/i)) return 'PYDANTIC_VALIDATION';
        if (output.match(/ModuleNotFoundError/i)) return 'IMPORT_ERROR';
        if (output.match(/ImportError/i)) return 'IMPORT_ERROR';
        if (output.match(/SyntaxError/i)) return 'SYNTAX_ERROR';
        if (output.match(/IndentationError/i)) return 'SYNTAX_ERROR';
        if (output.match(/pytest: command not found/i)) return 'MISSING_PYTEST';
        if (output.match(/No module named pytest/i)) return 'MISSING_PYTEST';
        if (output.match(/usage: pytest/i) && output.match(/error:/i)) return 'CONFIG_ERROR';

        return 'UNKNOWN_ERROR';
    }

    /**
     * Attempt to fix the detected issue
     */
    private async attemptFix(
        issueType: string,
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        logger.info(`🔧 Attempting to fix: ${issueType}`);

        switch (issueType) {
            case 'NO_TESTS_FOUND':
                return await this.fixTestDiscovery(project, projectPath, healer, errorOutput);

            case 'PYDANTIC_VALIDATION':
                return await this.fixPydanticValidation(project, projectPath, healer, errorOutput);

            case 'IMPORT_ERROR':
                return await this.fixImportError(project, projectPath, healer, errorOutput);

            case 'MISSING_PYTEST':
                return await this.fixMissingPytest(projectPath, healer);

            case 'SYNTAX_ERROR':
                logger.warn('Syntax error detected during execution');
                return false;

            default:
                logger.warn(`Unknown issue type: ${issueType}`);
                return false;
        }
    }

    /**
     * Fix test discovery issues
     */
    private async fixTestDiscovery(
        project: ProjectDescriptor,
        _projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        // Add issue for no tests found
        healer.addIssue(
            project.name,
            'execution',
            'error',
            'NO_TESTS_FOUND',
            'Pytest could not discover test files',
            `Tests exist but Pytest's discovery patterns don't match them. Output: ${errorOutput.substring(0, 200)}`
        );

        // Trigger Pytest config fix (PythonEnvironmentHealer handles this via detectTestFilePatternMismatch)
        // But detectTestFilePatternMismatch is called in analyze.
        // So we just need to ensure analyze is called (which it is in the loop).
        // But we can also explicitly call a fix method if we want to be sure.

        // If we are here, it means analyze didn't catch it or didn't fix it yet.
        // We can force a check.

        if (healer instanceof PythonEnvironmentHealer) {
            // We can try to force pattern update if we can parse the output to see what it looked for
            // But detectTestFilePatternMismatch relies on generatedFiles.
            // We have generatedFiles passed to executeWithAutoFix.
            // But we don't have them here easily unless we pass them down.
            // Wait, generatedFiles is passed to executeWithAutoFix, but not to attemptFix.
            // I should pass it.
        }

        // For now, let's rely on the loop calling analyze() again.
        // But we need to return true to say "we handled it" (by reporting it) so the loop continues.
        return true;
    }

    /**
     * Fix Pydantic validation errors in generated tests
     */
    private async fixPydanticValidation(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        logger.info('Detected Pydantic ValidationError in generated tests');

        // Extract failing test file and model name from error output
        const testFileMatch = errorOutput.match(/([^\s]+\.py):(\d+):/);
        const modelMatch = errorOutput.match(/ValidationError: \d+ validation errors? for (\w+)/);

        if (!testFileMatch || !modelMatch) {
            logger.warn('Could not extract test file or model name from Pydantic error');
            return false;
        }

        const testFile = testFileMatch[1];
        const modelName = modelMatch[1];
        logger.info(`Pydantic error in ${testFile} for model ${modelName}`);

        // Find model definition
        // We search in the project path for python files that define this class
        const modelFiles = await findFiles(projectPath, '**/*.py');
        let modelDefinition = '';

        for (const file of modelFiles) {
            // Skip test files and venv
            if (file.includes('tests/') || file.includes('.venv') || file.includes('__pycache__')) continue;

            const content = await readFile(path.join(projectPath, file));
            if (content.includes(`class ${modelName}`)) {
                modelDefinition = content;
                logger.info(`Found model definition in ${file}`);
                break;
            }
        }

        if (!modelDefinition) {
            logger.warn(`Could not find definition for model ${modelName}`);
            // Fallback to just reporting
            healer.addIssue(
                project.name,
                'execution',
                'error',
                'PYDANTIC_VALIDATION_IN_GENERATED_TESTS',
                `Generated tests have Pydantic validation errors for model ${modelName}`,
                `Fix test file: ${testFile}. Ensure model construction matches schema definition.`
            );
            return false;
        }

        // Regenerate test using LLM
        try {
            const config = healer.getConfig();
            const client = new OpenRouterClient(config.llm.api_key || '');
            const model = config.llm.models?.coder || config.llm.model;

            const testFilePath = path.join(projectPath, testFile);

            if (!(await import('../utils/fileUtils')).fileExists(testFilePath)) {
                // Try finding it relative to project root if absolute path failed
                // Sometimes pytest output gives relative path
            }

            // Ensure we have the correct path. testFile from output might be relative or absolute
            let absoluteTestPath = testFile;
            if (!path.isAbsolute(testFile)) {
                absoluteTestPath = path.join(projectPath, testFile);
            }

            const testContent = await readFile(absoluteTestPath);

            const prompt = `
You are an expert Python developer. A Pytest test is failing with a Pydantic ValidationError.
Your task is to fix the test code to match the Pydantic model definition.

Model Definition:
\`\`\`python
${modelDefinition}
\`\`\`

Failing Test Code:
\`\`\`python
${testContent}
\`\`\`

Error Message:
${errorOutput}

Return the corrected test file content. Do not include any explanation, just the code block.
`;

            logger.info(`Regenerating test ${testFile} using LLM...`);

            const messages: LLMMessage[] = [
                { role: 'system' as const, content: 'You are an expert Python developer. Fix the failing test.' },
                { role: 'user' as const, content: prompt }
            ];

            const response = await client.chatCompletion(model, messages, 'fix-pydantic');

            // Extract code block
            const codeMatch = response.match(/```python\n([\s\S]*?)```/) || response.match(/```\n([\s\S]*?)```/);
            const newContent = codeMatch ? codeMatch[1] : response;

            await writeFile(absoluteTestPath, newContent);
            logger.info(`Regenerated test file ${testFile}`);

            return true;

        } catch (error) {
            logger.error(`Failed to regenerate test: ${error}`);
            return false;
        }
    }

    /**
     * Fix import errors (missing dependencies or incorrect import paths)
     */
    private async fixImportError(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        // Extract module name
        const match = errorOutput.match(/ModuleNotFoundError: No module named '(.+)'/);
        if (match) {
            const moduleName = match[1];
            logger.info(`Detected missing module: ${moduleName}`);

            // Check if this is an import path issue (module name contains project path structure)
            // Pattern: services.user_service.app.services → should be app.services
            // Pattern: services.<project-name>.<subpath> → should be <subpath>
            const projectNamePattern = new RegExp(`services\\.${project.name.replace(/-/g, '_')}\\.(.+)`);
            const pathMatch = moduleName.match(projectNamePattern);

            if (pathMatch) {
                // This is an incorrect import path, not a missing dependency
                const correctImport = pathMatch[1]; // e.g., "app.services"
                logger.info(`Import path issue detected: ${moduleName} → ${correctImport}`);

                healer.addIssue(
                    project.name,
                    'execution',
                    'error',
                    'PYTHON_IMPORT_PATH_ERROR',
                    `Incorrect import path in generated tests: ${moduleName}`,
                    `Should use ${correctImport} instead`
                );

                // Fix the import in generated test files
                if (healer instanceof PythonEnvironmentHealer) {
                    await this.fixIncorrectImportPath(projectPath, moduleName, correctImport);
                    return true;
                }
            }
            // Check for common root modules that should be prefixed with 'app.'
            else if ((moduleName === 'main' || moduleName === 'database') && healer instanceof PythonEnvironmentHealer) {
                // Check if app/main.py or app/database.py exists
                const { fileExists } = await import('../utils/fileUtils');
                const modulePath = path.join(projectPath, 'app', `${moduleName}.py`);

                if (await fileExists(modulePath)) {
                    const correctImport = `app.${moduleName}`;
                    logger.info(`Import path issue detected: ${moduleName} → ${correctImport}`);

                    healer.addIssue(
                        project.name,
                        'execution',
                        'error',
                        'PYTHON_IMPORT_PATH_ERROR',
                        `Incorrect import path in generated tests: ${moduleName}`,
                        `Should use ${correctImport} instead`
                    );

                    await this.fixIncorrectImportPath(projectPath, moduleName, correctImport);
                    return true;
                }
            }

            if (!pathMatch) {
                // This is genuinely a missing dependency
                healer.addIssue(
                    project.name,
                    'execution',
                    'error',
                    'MISSING_DEP',
                    `Missing dependency: ${moduleName}`,
                    moduleName
                );

                // Add remediation to install it
                // We can try to auto-install it right now
                if (healer instanceof PythonEnvironmentHealer) {
                    logger.info(`Auto-installing missing python package: ${moduleName}`);
                    await healer.installPackage(projectPath, moduleName, 'MISSING_DEP');
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Fix incorrect import paths in Python test files
     */
    private async fixIncorrectImportPath(
        projectPath: string,
        incorrectImport: string,
        correctImport: string
    ): Promise<void> {
        logger.info(`Fixing import paths: ${incorrectImport} → ${correctImport}`);

        const { readFile, writeFile, findFiles } = await import('../utils/fileUtils');

        // Find all Python test files in the project
        const testFiles = await findFiles(projectPath, '**/{test_,tests/}*.py', {
            ignore: ['**/node_modules/**', '**/.venv/**', '**/venv/**']
        });

        let fixedCount = 0;

        for (const testFile of testFiles) {
            try {
                const content = await readFile(testFile);

                // Check if this file has the incorrect import
                if (!content.includes(incorrectImport)) continue;

                // Replace the incorrect import with the correct one
                const fixedContent = content.replace(
                    new RegExp(`from ${incorrectImport.replace(/\./g, '\\.')}`, 'g'),
                    `from ${correctImport}`
                ).replace(
                    new RegExp(`import ${incorrectImport.replace(/\./g, '\\.')}`, 'g'),
                    `import ${correctImport}`
                );

                if (fixedContent !== content) {
                    await writeFile(testFile, fixedContent);
                    logger.info(`✅ Fixed import in ${testFile}`);
                    fixedCount++;
                }
            } catch (error) {
                logger.warn(`Failed to fix imports in ${testFile}: ${error}`);
            }
        }

        logger.info(`Fixed ${fixedCount} test file(s) with incorrect import paths`);
    }

    /**
     * Fix missing pytest
     */
    private async fixMissingPytest(
        projectPath: string,
        healer: EnvironmentHealer
    ): Promise<boolean> {
        logger.info('Installing pytest...');
        // We can trigger this by adding an issue
        healer.addIssue(
            'Unknown',
            'env-setup',
            'error',
            'MISSING_PYTEST_DEP',
            'pytest not installed',
            'pytest'
        );
        await healer.heal(projectPath);
        return true;
    }
}

import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { EnvironmentHealer } from '../env/EnvironmentHealer';
import { NodeEnvironmentHealer } from '../env/NodeEnvironmentHealer';
import { EnvironmentIssue, AutoFixAction } from '../models/EnvironmentModels';
import { SyntaxValidator, ValidationResult } from '../validator/SyntaxValidator';
import { execAsync } from '../utils/execUtils';
import logger from '../utils/logger';

/**
 * Implements iterative auto-fix healing loop for Jest
 * Keeps trying to fix issues until tests run or hard blocker is reached
 */
export class JestAutoFixLoop {
    private maxIterations: number = 5;
    private validator: SyntaxValidator;

    constructor() {
        this.validator = new SyntaxValidator();
    }

    /**
     * Execute Jest with auto-fix loop
     * Returns when tests run successfully or hard blocker is reached
     */
    async executeWithAutoFix(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        generatedFiles: string[],
        command?: string
    ): Promise<{
        success: boolean;
        attempts: number;
        finalIssues: EnvironmentIssue[];
        finalActions: AutoFixAction[];
        hardBlocker?: string;
    }> {
        let attempts = 0;
        let lastError: string = '';

        logger.info(`🔄 Starting Jest auto-fix loop for ${project.name}`);

        while (attempts < this.maxIterations) {
            attempts++;
            logger.info(`\n📍 Attempt ${attempts}/${this.maxIterations}`);

            // Step 1: Validate syntax before attempting to run
            const syntaxResult = await this.validator.validateTypeScript(projectPath, generatedFiles);
            if (!syntaxResult.valid) {
                logger.warn(`❌ Syntax errors detected in iteration ${attempts}`);

                // Try to regenerate or fix test files
                const fixed = await this.attemptSyntaxFix(syntaxResult, generatedFiles, healer);
                if (!fixed) {
                    return {
                        success: false,
                        attempts,
                        finalIssues: healer.getIssues(),
                        finalActions: healer.getActions(),
                        hardBlocker: 'Unable to fix syntax errors after multiple attempts'
                    };
                }
                continue; // Retry after syntax fix
            }

            // Step 2: Try to run Jest
            try {
                logger.info('🧪 Attempting to run Jest...');
                const cmd = command || `cd "${projectPath}" && npm test`;
                // Ensure we are in the project path if command doesn't handle it
                const finalCmd = cmd.includes(`cd "${projectPath}"`) ? cmd : `cd "${projectPath}" && ${cmd}`;

                const { stdout, stderr } = await execAsync(finalCmd, {
                    timeout: 60000
                });

                // Check if tests were actually discovered and run
                if (this.testsWereFound(stdout, stderr)) {
                    logger.info('✅ Jest tests discovered and executed successfully!');
                    return {
                        success: true,
                        attempts,
                        finalIssues: healer.getIssues(),
                        finalActions: healer.getActions()
                    };
                }

                // Tests not found - analyze and fix
                logger.warn('⚠️  Tests exist but were not discovered by Jest');
                await this.fixTestDiscovery(project, projectPath, healer, stdout + stderr);

            } catch (error: any) {
                lastError = error.message || String(error);
                const output = (error.stdout || '') + (error.stderr || '');

                logger.warn(`⚠️  Jest execution failed: ${lastError.substring(0, 100)}...`);

                // Analyze error and attempt fix
                const issueType = this.analyzeJestError(output);
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
     * Check if Jest actually found and ran tests
     */
    private testsWereFound(stdout: string, stderr: string): boolean {
        const output = stdout + stderr;

        // Positive indicators
        if (output.match(/Tests:\s+\d+\s+passed/i)) return true;
        if (output.match(/\d+\s+passed,\s+\d+\s+total/i)) return true;
        if (output.match(/Test Suites:.*passed/i)) return true;

        // Negative indicators
        if (output.match(/No tests found/i)) return false;
        if (output.match(/0 tests? passed/i)) return false;

        // Default: assume tests ran if no error thrown
        return !output.match(/Error|Failed|Cannot find|ENOENT/i);
    }

    /**
     * Detect if test failures are due to unreachable service
     */
    private detectServiceUnavailability(output: string): { detected: boolean; url?: string; port?: number } {
        // Pattern: ECONNREFUSED 127.0.0.1:3000 or connect ECONNREFUSED
        const connRefusedMatch = output.match(/ECONNREFUSED\s+([\d.]+):(\d+)|connect ECONNREFUSED/i);

        // Also check for common patterns like "GET http://localhost:3000/health"
        const urlMatch = output.match(/(?:GET|POST|PUT|DELETE)\s+(https?:\/\/[^\/\s]+)/i);

        if (connRefusedMatch || (urlMatch && output.includes('ECONNREFUSED'))) {
            const port = connRefusedMatch ? parseInt(connRefusedMatch[2]) : 3000;
            const host = connRefusedMatch ? connRefusedMatch[1] : 'localhost';
            const url = urlMatch ? urlMatch[1] : `http://${host}:${port}`;

            return {
                detected: true,
                url,
                port
            };
        }

        return { detected: false };
    }

    /**
     * Analyze Jest error to determine issue type
     */
    private analyzeJestError(output: string): string {
        // Check for service unavailability FIRST (before other checks)
        if (this.detectServiceUnavailability(output).detected) {
            return 'SERVICE_UNAVAILABLE';
        }

        if (output.match(/No tests found/i)) return 'NO_TESTS_FOUND';
        if (output.match(/Cannot find module.*ts-jest/i)) return 'MISSING_TS_JEST';
        if (output.match(/Unexpected token/i)) return 'SYNTAX_ERROR';
        if (output.match(/Missing semicolon/i)) return 'SYNTAX_ERROR';
        if (output.match(/preset.*not found/i)) return 'MISSING_PRESET';
        if (output.match(/transform.*not found/i)) return 'MISSING_TRANSFORMER';
        if (output.match(/jest\.config.*not found/i)) return 'MISSING_CONFIG';
        if (output.match(/Cannot redefine property/i)) return 'VITEST_MOCK_ERROR';
        if (output.match(/is not a function/i) && output.match(/vi\.mock/i)) return 'VITEST_MOCK_ERROR';

        // TypeScript errors in test files
        if (output.match(/TS6133|TS7006|TS2345|TS2322|TS2339|TS2698|TS18046|TS2578|TS2741/)) {
            return 'TEST_TYPESCRIPT_ERROR';
        }

        // Missing dependencies (must come after TS errors to avoid false positives)
        if (output.match(/Cannot find module/i)) return 'MISSING_DEPENDENCY';

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

            case 'MISSING_TS_JEST':
            case 'MISSING_PRESET':
            case 'MISSING_TRANSFORMER':
                return await this.fixMissingDependencies(projectPath, healer);

            case 'MISSING_DEPENDENCY':
                return await this.fixMissingDependency(project, projectPath, healer, errorOutput);

            case 'TEST_TYPESCRIPT_ERROR':
                return await this.fixTestTypeScriptErrors(project, projectPath, healer, errorOutput);

            case 'MISSING_CONFIG':
                return await this.fixMissingConfig(project, projectPath, healer);

            case 'VITEST_MOCK_ERROR':
                return await this.fixVitestMocking(project, projectPath, healer, errorOutput);

            case 'SERVICE_UNAVAILABLE':
                return await this.fixServiceUnavailability(project, projectPath, healer, errorOutput);

            case 'SYNTAX_ERROR':
                // Syntax errors should be caught earlier, but handle if they slip through
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
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        // Add issue for no tests found
        healer.addIssue(
            project.name,
            'execution',
            'error',
            'NO_TESTS_FOUND',
            'Jest could not discover test files',
            `Tests exist but Jest's testMatch patterns don't match them. Output: ${errorOutput.substring(0, 200)}`
        );

        // Trigger Jest config fix
        await healer.heal(projectPath);

        logger.info('✓ Updated Jest configuration for test discovery');
        return true;
    }

    /**
     * Fix missing dependencies
     */
    private async fixMissingDependencies(
        projectPath: string,
        healer: EnvironmentHealer
    ): Promise<boolean> {
        logger.info('Installing missing Jest dependencies...');
        await healer.heal(projectPath);
        return true;
    }

    /**
     * Fix missing Jest configuration
     */
    private async fixMissingConfig(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer
    ): Promise<boolean> {
        healer.addIssue(
            project.name,
            'env-setup',
            'error',
            'JEST_TS_MISCONFIGURED',
            'Missing Jest configuration',
            'No jest.config file found'
        );

        await healer.heal(projectPath);
        logger.info('✓ Created Jest configuration');
        return true;
    }

    /**
     * Attempt to fix syntax errors in generated tests
     */
    private async attemptSyntaxFix(
        syntaxResult: ValidationResult,
        _generatedFiles: string[],
        _healer: EnvironmentHealer
    ): Promise<boolean> {
        logger.warn(`Found ${syntaxResult.errors.length} syntax errors`);

        // Log each error
        for (const error of syntaxResult.errors.slice(0, 5)) { // Show max 5
            logger.warn(`  ${error.file}:${error.line} - ${error.message}`);
        }

        // For now, we can't automatically fix syntax errors
        // This would require regenerating tests via LLM
        // Mark as a blocker
        return false;
    }

    /**
     * Handle service unavailability errors
     */
    private async fixServiceUnavailability(
        project: ProjectDescriptor,
        _projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        const detection = this.detectServiceUnavailability(errorOutput);

        logger.warn(`Service unavailable detected: ${detection.url}`);

        healer.addIssue(
            project.name,
            'execution',
            'error',
            'SERVICE_UNAVAILABLE',
            `Target service not reachable at ${detection.url}`,
            `Integration/E2E tests require a running service. Detected connection refused errors for ${detection.url}. Start the service before running tests, or configure the bot with appropriate service startup commands.`
        );

        // Cannot auto-fix service unavailability, return false
        return false;
    }

    /**
     * Attempt to fix Vitest VI mocking errors
     */
    private async fixVitestMocking(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        if (healer instanceof NodeEnvironmentHealer) {
            healer.addIssue(
                project.name,
                'execution',
                'error',
                'VITEST_MOCK_ERROR',
                'Vitest mocking error detected',
                errorOutput.substring(0, 200)
            );

            await healer.heal(projectPath);
            return true;
        }
        return false;
    }

    /**
     * Fix missing dependency issues (internal modules or external packages)
     */
    private async fixMissingDependency(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        logger.info('Analyzing missing dependency...');

        // Extract module path from error
        const moduleMatch = errorOutput.match(/Cannot find module '([^']+)'/);
        if (!moduleMatch) {
            logger.warn('Could not extract module name from error');
            return false;
        }

        const modulePath = moduleMatch[1];
        logger.info(`Missing module: ${modulePath}`);

        // Determine if it's an internal or external dependency
        if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
            // Internal module - likely .js vs .ts mismatch
            return await this.fixInternalModule(project, projectPath, healer, errorOutput, modulePath);
        } else {
            // External package - check if it's a Node.js builtin first
            const builtins = ['fs', 'path', 'http', 'https', 'crypto', 'util', 'events', 'stream',
                'os', 'url', 'querystring', 'Buffer', 'process', 'timers', 'dns'];

            const packageName = modulePath.startsWith('@') ? modulePath : modulePath.split('/')[0];

            if (builtins.includes(packageName)) {
                logger.info(`${packageName} is a Node.js built-in module, not installing`);
                return false;
            }

            // External package
            return await this.fixExternalPackage(project, projectPath, healer, packageName);
        }
    }

    /**
     * Fix internal module resolution issues (.js vs .ts)
     */
    private async fixInternalModule(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string,
        modulePath: string
    ): Promise<boolean> {
        if (healer instanceof NodeEnvironmentHealer) {
            const fixed = await healer.fixInternalModulePath(projectPath, errorOutput, modulePath);
            if (fixed) {
                logger.info(`✓ Fixed internal module import: ${modulePath}`);
                // Add issue for reporting (severity: info because it was auto-fixed)
                const fixedPath = modulePath.replace(/\.js$/, '');
                healer.addIssue(
                    project.name,
                    'execution',
                    'info',
                    'JEST_INTERNAL_MODULE_MISMATCH',
                    `Auto-fixed internal module import with .js extension`,
                    `Changed import from '${modulePath}' to '${fixedPath}' to allow ts-jest resolution of TypeScript modules`
                );
                return true;
            }
        }

        healer.addIssue(
            project.name,
            'execution',
            'error',
            'JEST_INTERNAL_MODULE_MISMATCH',
            `Test imports '${modulePath}' but corresponding file not found`,
            `Check if the path is correct. For TypeScript projects, import paths should not include .js extensions.`
        );

        return false;
    }

    /**
     * Fix external package dependency
     */
    private async fixExternalPackage(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        packageName: string
    ): Promise<boolean> {
        if (healer instanceof NodeEnvironmentHealer) {
            const installed = await healer.installMissingPackage(packageName, projectPath);
            if (installed) {
                logger.info(`✓ Installed missing package: ${packageName}`);
                // Add issue for reporting (severity: info because it was auto-fixed)
                healer.addIssue(
                    project.name,
                    'execution',
                    'info',
                    'JEST_MISSING_NPM_PACKAGE',
                    `Auto-installed missing package: ${packageName}`,
                    `Installed ${packageName} and attempted to install @types/${packageName} for TypeScript support`
                );
                return true;
            }
        }

        healer.addIssue(
            project.name,
            'execution',
            'error',
            'JEST_MISSING_NPM_PACKAGE',
            `Missing package: ${packageName}`,
            `Install manually via: npm install ${packageName}`
        );

        return false;
    }

    /**
     * Fix TypeScript errors in test files by injecting @ts-nocheck
     */
    private async fixTestTypeScriptErrors(
        project: ProjectDescriptor,
        projectPath: string,
        healer: EnvironmentHealer,
        errorOutput: string
    ): Promise<boolean> {
        logger.info('Fixing TypeScript errors in test files...');

        if (healer instanceof NodeEnvironmentHealer) {
            const fixed = await healer.fixTestTypeScriptErrors(projectPath, errorOutput);
            if (fixed) {
                logger.info(`✓ Fixed TypeScript errors in test files`);
                return true;
            }
        }

        healer.addIssue(
            project.name,
            'execution',
            'warning',
            'TEST_TYPESCRIPT_ERROR',
            'TypeScript errors in test files',
            'Consider adding // @ts-nocheck to test files or fixing type issues manually'
        );

        return false;
    }
}

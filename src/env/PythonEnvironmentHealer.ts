import path from 'path';
import { EnvironmentHealer } from './EnvironmentHealer.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { fileExists, readFile, writeFile, dirExists } from '../utils/fileUtils.js';
import logger from '../utils/logger.js';

/**
 * Healer for Python environments
 * Handles virtualenv creation, requirements installation, and pytest configuration
 */
export class PythonEnvironmentHealer extends EnvironmentHealer {

    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing Python environment for ${project.name}`);

        // 1. Check Virtual Environment
        const venvPath = path.join(projectPath, '.venv');
        if (!(await dirExists(venvPath))) {
            this.addIssue(
                project.name,
                'env-setup',
                'warning',
                'MISSING_VENV',
                'Virtual environment (.venv) not found',
                'Python projects require a virtual environment for isolation'
            );
            this.addRemediation('MISSING_VENV', [{
                title: 'Create Virtual Environment',
                description: 'Create a new virtual environment using python3 venv',
                command: 'python3 -m venv .venv'
            }]);
        }

        // 2. Check Requirements
        const reqPath = path.join(projectPath, 'requirements.txt');
        if (await fileExists(reqPath)) {
            // We assume if venv is missing, requirements aren't installed either
            // But if venv exists, we should check if pytest is installed
            // For now, we'll just flag if pytest is missing from requirements.txt
            const content = await readFile(reqPath);
            if (!content.includes('pytest')) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'warning',
                    'MISSING_PYTEST_DEP',
                    'pytest not listed in requirements.txt',
                    'requirements.txt'
                );
                this.addRemediation('MISSING_PYTEST_DEP', [{
                    title: 'Add pytest',
                    description: 'Add pytest to requirements.txt',
                    command: 'echo "pytest" >> requirements.txt'
                }]);
            }
        }

        // 3. Check Pytest Config
        const iniPath = path.join(projectPath, 'pytest.ini');
        if (!(await fileExists(iniPath))) {
            this.addIssue(
                project.name,
                'analysis',
                'info',
                'MISSING_PYTEST_INI',
                'pytest.ini configuration file missing',
                'pytest.ini'
            );
            this.addRemediation('MISSING_PYTEST_INI', [{
                title: 'Create pytest.ini',
                description: 'Create a basic pytest configuration file',
                command: 'echo "[pytest]\ntestpaths = tests\npython_files = test_*.py" > pytest.ini'
            }]);
        } else {
            // 4. Check for pattern mismatch between generated files and pytest.ini
            await this.detectTestFilePatternMismatch(project, projectPath, iniPath, generatedFiles);
        }

        // 5. Check coverage expectations
        if (generatedFiles.length > 0) {
            const hasUnit = generatedFiles.some(f => f.includes('/unit/'));
            const hasIntegration = generatedFiles.some(f => f.includes('/integration/'));
            const hasE2E = generatedFiles.some(f => f.includes('/e2e/'));

            if (!hasUnit || !hasIntegration) {
                const missing = [];
                if (!hasUnit) missing.push('unit');
                if (!hasIntegration) missing.push('integration');

                this.addIssue(
                    project.name,
                    'generation',
                    'info',
                    'PARTIAL_TEST_COVERAGE',
                    `Only ${hasE2E ? 'E2E' : 'partial'} tests were generated`,
                    `Missing test types: ${missing.join(', ')}. This is expected for some projects where only E2E tests are applicable.`
                );
            }
        }
    }

    async heal(projectPath: string): Promise<void> {
        // 1. Create Virtualenv
        const venvIssue = this.issues.find(i => i.code === 'MISSING_VENV' && !i.autoFixed);
        if (venvIssue && this.canCreateVirtualenv()) {
            await this.createVirtualenv(projectPath, venvIssue.code);
        }

        // 2. Install Requirements (if venv exists or was created)
        const venvExists = await dirExists(path.join(projectPath, '.venv'));
        if (venvExists && this.canInstallDependencies()) {
            // Check if we need to install requirements
            // We'll just run pip install -r requirements.txt if it exists
            if (await fileExists(path.join(projectPath, 'requirements.txt'))) {
                await this.installRequirements(projectPath);
            }

            // Ensure pytest is installed
            await this.ensurePytestInstalled(projectPath);
        }

        // 3. Create pytest.ini
        const iniIssue = this.issues.find(i => i.code === 'MISSING_PYTEST_INI' && !i.autoFixed);
        if (iniIssue && this.canUpdateConfig()) {
            await this.createPytestIni(projectPath, iniIssue.code);
        }

        // 4. Fix pytest pattern mismatches
        const patternIssue = this.issues.filter(i => i.code === 'PYTEST_PATTERN_MISMATCH' && !i.autoFixed);
        for (const issue of patternIssue) {
            if (this.canUpdateConfig()) {
                await this.autoFixPytestPatterns(projectPath, issue.code);
            }
        }

        // 5. Install generic missing dependencies (from execution errors)
        const depIssues = this.issues.filter(i => i.code === 'MISSING_DEP' && !i.autoFixed);
        for (const issue of depIssues) {
            if (this.canInstallDependencies() && issue.details) {
                await this.installPackage(projectPath, issue.details, issue.code);
            }
        }
    }

    private async createVirtualenv(projectPath: string, issueCode: string): Promise<void> {
        const action = await this.executeCommand(
            'python3 -m venv .venv',
            projectPath,
            'Create virtual environment',
            path.basename(projectPath)
        );

        if (action.success) {
            this.markIssueFixed(issueCode, [action]);
        }
    }

    private async installRequirements(projectPath: string): Promise<void> {
        // Use the venv pip
        const pipCmd = path.join('.venv', 'bin', 'pip');
        await this.executeCommand(
            `${pipCmd} install -r requirements.txt`,
            projectPath,
            'Install requirements',
            path.basename(projectPath)
        );
    }

    private async ensurePytestInstalled(projectPath: string): Promise<void> {
        const pipCmd = path.join('.venv', 'bin', 'pip');
        // Check if installed first? Or just try to install
        await this.executeCommand(
            `${pipCmd} install pytest`,
            projectPath,
            'Ensure pytest installed',
            path.basename(projectPath)
        );
    }

    private async createPytestIni(projectPath: string, issueCode: string): Promise<void> {
        const iniPath = path.join(projectPath, 'pytest.ini');
        const content = `[pytest]
testpaths = tests
python_files = test_*.py
`;
        await writeFile(iniPath, content);

        const action = {
            project: path.basename(projectPath),
            path: iniPath,
            command: 'create-file',
            description: 'Created pytest.ini',
            success: true,
            timestamp: new Date().toISOString()
        };
        this.actions.push(action);
        this.markIssueFixed(issueCode, [action]);
    }

    /**
     * Detect mismatch between generated test file patterns and pytest.ini patterns
     */
    private async detectTestFilePatternMismatch(
        project: ProjectDescriptor,
        projectPath: string,
        iniPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        const content = await readFile(iniPath);

        // Extract python_files patterns from pytest.ini
        const pythonFilesMatch = content.match(/python_files\s*=\s*(.+)/);
        if (!pythonFilesMatch) return;

        const patterns = pythonFilesMatch[1].trim().split(/\s+/);

        // Check if any generated files don't match the patterns
        const mismatchedFiles: string[] = [];
        const neededPatterns = new Set<string>();

        for (const file of generatedFiles) {
            const basename = path.basename(file);
            const matches = patterns.some(pattern => {
                // Simple glob matching: test_*.py, *_e2e.py, etc.
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\./g, '\\.') + '$');
                return regex.test(basename);
            });

            if (!matches) {
                mismatchedFiles.push(file);

                // Infer needed pattern from filename
                if (basename.endsWith('_e2e.py')) {
                    neededPatterns.add('*_e2e.py');
                } else if (basename.endsWith('_integration.py')) {
                    neededPatterns.add('*_integration.py');
                } else if (basename.endsWith('.e2e.py')) {
                    neededPatterns.add('*.e2e.py');
                }
            }
        }

        if (mismatchedFiles.length > 0) {
            const relativeFiles = mismatchedFiles.map(f => path.relative(projectPath, f)).join(', ');
            const patternsToAdd = Array.from(neededPatterns).join(', ');

            const issue = {
                project: project.name,
                stage: 'execution' as const,
                severity: 'error' as const,
                code: 'PYTEST_PATTERN_MISMATCH',
                message: 'Generated test files do not match pytest.ini discovery patterns',
                details: `Files: ${relativeFiles}. Current patterns: ${patterns.join(' ')}. Needed: ${patternsToAdd}`,
                filePath: 'pytest.ini',
                autoFixed: false,
            };
            this.issues.push(issue);

            this.addRemediation('PYTEST_PATTERN_MISMATCH', [{
                title: 'Update pytest.ini patterns',
                description: `Add ${patternsToAdd} to python_files in pytest.ini to discover generated test files: ${relativeFiles}`,
                filePath: 'pytest.ini'
            }]);
        }
    }

    /**
     * Auto-fix pytest pattern mismatches by updating pytest.ini
     */
    private async autoFixPytestPatterns(projectPath: string, issueCode: string): Promise<void> {
        const iniPath = path.join(projectPath, 'pytest.ini');
        if (!(await fileExists(iniPath))) return;

        let content = await readFile(iniPath);

        // Check if we need to add *_e2e.py, *_integration.py patterns
        const issue = this.issues.find(i => i.code === issueCode);
        if (!issue || !issue.details) return;

        // Extract the needed patterns from issue details
        const neededMatch = issue.details.match(/Needed: (.+)/);
        if (!neededMatch) return;

        const neededPatterns = neededMatch[1].split(', ');

        // Update python_files line
        const pythonFilesMatch = content.match(/python_files\s*=\s*(.+)/);
        if (pythonFilesMatch) {
            const currentPatterns = pythonFilesMatch[1].trim();
            const currentPatternList = currentPatterns.split(/\s+/);

            // Only add patterns that don't already exist
            const newPatternsToAdd = neededPatterns.filter(p => !currentPatternList.includes(p));

            if (newPatternsToAdd.length > 0) {
                const updatedPatterns = currentPatterns + ' ' + newPatternsToAdd.join(' ');
                content = content.replace(
                    /python_files\s*=\s*.+/,
                    `python_files = ${updatedPatterns}`
                );

                await writeFile(iniPath, content);

                this.actions.push({
                    project: path.basename(projectPath),
                    path: iniPath,
                    command: 'update-file',
                    description: `Updated pytest.ini to include patterns: ${newPatternsToAdd.join(', ')}`,
                    success: true,
                    timestamp: new Date().toISOString()
                });
                this.markIssueFixed(issueCode, [this.actions[this.actions.length - 1]]);

                logger.info(`Auto-fixed pytest.ini patterns in ${projectPath}`);
            }
        }
    }
    private async installPackage(projectPath: string, packageName: string, issueCode: string): Promise<void> {
        const pipCmd = path.join('.venv', 'bin', 'pip');
        // Fallback to python3 -m pip if venv pip doesn't exist?
        // For now assume venv structure.

        const action = await this.executeCommand(
            `${pipCmd} install ${packageName}`,
            projectPath,
            `Install package ${packageName}`,
            path.basename(projectPath)
        );

        if (action.success) {
            this.markIssueFixed(issueCode, [action]);
        }
    }
}

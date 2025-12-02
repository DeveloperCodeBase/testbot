import { EnvironmentHealer } from './EnvironmentHealer.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { fileExists, readFile } from '../utils/fileUtils.js';
import { execAsync } from '../utils/execUtils.js';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * Environment healer for Go projects
 */
export class GoEnvironmentHealer extends EnvironmentHealer {
    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        _generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing Go environment for project: ${project.name}`);

        // 1. Check for go.mod file
        await this.checkGoMod(project, projectPath);

        // 2. Check for Go installation
        await this.checkGoInstallation(project, projectPath);

        // 3. Check for test dependencies (testify if used)
        await this.checkTestDependencies(project, projectPath, _generatedFiles);
    }

    async heal(projectPath: string): Promise<void> {
        logger.info(`Healing Go environment at: ${projectPath}`);

        // 1. Initialize go.mod if missing
        const modIssues = this.issues.filter(i => i.code === 'MISSING_GO_MOD' && !i.autoFixed);
        for (const issue of modIssues) {
            if (this.canUpdateConfig()) {
                await this.initGoMod(projectPath, issue.code);
            }
        }

        // 2. Install missing dependencies
        const depIssues = this.issues.filter(i => i.code === 'MISSING_GO_DEPENDENCY' && !i.autoFixed);
        for (const issue of depIssues) {
            if (this.canUpdateConfig() && issue.details) {
                await this.installDependency(projectPath, issue.details, issue.code);
            }
        }

        // 3. Tidy dependencies
        const tidyIssues = this.issues.filter(i => i.code === 'GO_MOD_TIDY_NEEDED' && !i.autoFixed);
        for (const issue of tidyIssues) {
            if (this.canUpdateConfig()) {
                await this.runGoModTidy(projectPath, issue.code);
            }
        }
    }

    private async checkGoMod(project: ProjectDescriptor, projectPath: string): Promise<void> {
        const goModPath = path.join(projectPath, 'go.mod');

        if (!(await fileExists(goModPath))) {
            this.addIssue(
                project.name,
                'analysis',
                'warning',
                'MISSING_GO_MOD',
                'No go.mod file found',
                'Initialize Go module with go mod init'
            );
            this.addRemediation('MISSING_GO_MOD', [{
                title: 'Initialize Go module',
                description: 'Create go.mod file',
                command: `cd ${projectPath} && go mod init ${project.name}`
            }]);
        }
    }

    private async checkGoInstallation(_project: ProjectDescriptor, _projectPath: string): Promise<void> {
        try {
            const result = await execAsync('go version');
            logger.info(`Detected Go version: ${result.stdout.trim()}`);
        } catch (error) {
            this.addIssue(
                _project.name,
                'env-setup',
                'error',
                'MISSING_GO',
                'Go not installed or not in PATH',
                'Install Go from https://golang.org/dl/'
            );
        }
    }

    private async checkTestDependencies(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        // Check if generated tests use testify
        const usesTestify = await this.filesContainTestify(generatedFiles);

        if (usesTestify) {
            const goModPath = path.join(projectPath, 'go.mod');
            if (await fileExists(goModPath)) {
                const content = await readFile(goModPath);
                if (!content.includes('github.com/stretchr/testify')) {
                    this.addIssue(
                        project.name,
                        'analysis',
                        'warning',
                        'MISSING_GO_DEPENDENCY',
                        'Missing testify dependency for testing',
                        'github.com/stretchr/testify'
                    );
                    this.addRemediation('MISSING_GO_DEPENDENCY', [{
                        title: 'Install testify',
                        description: 'Add testify testing library',
                        command: `cd ${projectPath} && go get github.com/stretchr/testify`
                    }]);
                }
            }
        }
    }

    private async filesContainTestify(files: string[]): Promise<boolean> {
        for (const file of files) {
            if (await fileExists(file)) {
                const content = await readFile(file);
                if (content.includes('github.com/stretchr/testify') ||
                    content.includes('assert.') ||
                    content.includes('require.')) {
                    return true;
                }
            }
        }
        return false;
    }

    private async initGoMod(projectPath: string, issueCode: string): Promise<void> {
        try {
            const moduleName = path.basename(projectPath);
            await execAsync(`cd "${projectPath}" && go mod init ${moduleName}`);

            const action = {
                project: path.basename(projectPath),
                path: path.join(projectPath, 'go.mod'),
                command: `go mod init ${moduleName}`,
                description: `Initialized Go module: ${moduleName}`,
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);
        } catch (error) {
            logger.error(`Failed to initialize go.mod: ${error}`);
        }
    }

    private async installDependency(projectPath: string, dependency: string, issueCode: string): Promise<void> {
        try {
            await execAsync(`cd "${projectPath}" && go get ${dependency}`);

            const action = {
                project: path.basename(projectPath),
                path: projectPath,
                command: `go get ${dependency}`,
                description: `Installed Go dependency: ${dependency}`,
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);
        } catch (error) {
            logger.error(`Failed to install dependency ${dependency}: ${error}`);
        }
    }

    private async runGoModTidy(projectPath: string, issueCode: string): Promise<void> {
        try {
            await execAsync(`cd "${projectPath}" && go mod tidy`);

            const action = {
                project: path.basename(projectPath),
                path: projectPath,
                command: 'go mod tidy',
                description: 'Cleaned up Go module dependencies',
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);
        } catch (error) {
            logger.error(`Failed to run go mod tidy: ${error}`);
        }
    }
}

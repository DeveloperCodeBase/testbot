import { EnvironmentHealer } from './EnvironmentHealer.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { readFile } from '../utils/fileUtils.js';
import { execAsync } from '../utils/execUtils.js';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * Environment healer for C# (.NET) projects
 */
export class CSharpEnvironmentHealer extends EnvironmentHealer {
    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        _generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing C# environment for project: ${project.name}`);

        // 1. Check for .NET SDK availability (critical)
        await this.checkDotNetSdk(project, projectPath);

        // 2. Check for .csproj file
        await this.checkProjectFile(project, projectPath);

        // 3. Check for test framework packages
        await this.checkTestFramework(project, projectPath);

        // 4. Check for coverage tooling
        await this.checkCoverageTool(project, projectPath);
    }

    async heal(projectPath: string): Promise<void> {
        logger.info(`Healing C# environment at: ${projectPath}`);

        // 1. Install missing packages
        const packageIssues = this.issues.filter(i => i.code === 'MISSING_PACKAGE' && !i.autoFixed);
        for (const issue of packageIssues) {
            if (this.canUpdateConfig() && issue.details) {
                await this.installPackage(projectPath, issue.details, issue.code);
            }
        }

        // 2. Install coverage tool
        const coverageIssues = this.issues.filter(i => i.code === 'MISSING_COVERAGE_TOOL' && !i.autoFixed);
        for (const issue of coverageIssues) {
            if (this.canUpdateConfig() && issue.details) {
                await this.installPackage(projectPath, issue.details, issue.code);
            }
        }

        // 3. Create test project if missing
        const projectIssues = this.issues.filter(i => i.code === 'MISSING_TEST_PROJECT' && !i.autoFixed);
        for (const issue of projectIssues) {
            if (this.canUpdateConfig()) {
                await this.createTestProject(projectPath, issue.code);
            }
        }
    }

    private async checkProjectFile(project: ProjectDescriptor, projectPath: string): Promise<void> {
        const csprojFiles = await this.findCsprojFiles(projectPath);

        if (csprojFiles.length === 0) {
            this.addIssue(
                project.name,
                'analysis',
                'error',
                'MISSING_PROJECT_FILE',
                'No .csproj file found in project directory',
                'Create a .csproj file for your C# project'
            );
            this.addRemediation('MISSING_PROJECT_FILE', [{
                title: 'Create .NET project',
                description: 'Create a new .NET project file',
                command: `cd ${projectPath} && dotnet new classlib -n ${project.name}`
            }]);
        }
    }

    private async checkTestFramework(project: ProjectDescriptor, projectPath: string): Promise<void> {
        const testFramework = project.testFramework || 'xunit';
        const csprojFiles = await this.findCsprojFiles(projectPath);

        for (const csprojFile of csprojFiles) {
            const content = await readFile(csprojFile);

            // Check for test framework package references
            if (testFramework === 'xunit') {
                if (!content.includes('xunit')) {
                    this.addIssue(
                        project.name,
                        'analysis',
                        'warning',
                        'MISSING_PACKAGE',
                        'Missing xUnit test framework',
                        'xunit'
                    );
                    this.addRemediation('MISSING_PACKAGE', [{
                        title: 'Install xUnit',
                        description: 'Add xUnit NuGet packages',
                        command: 'dotnet add package xunit && dotnet add package xunit.runner.visualstudio'
                    }]);
                }
            } else if (testFramework === 'nunit') {
                if (!content.includes('NUnit')) {
                    this.addIssue(
                        project.name,
                        'analysis',
                        'warning',
                        'MISSING_PACKAGE',
                        'Missing NUnit test framework',
                        'NUnit'
                    );
                    this.addRemediation('MISSING_PACKAGE', [{
                        title: 'Install NUnit',
                        description: 'Add NUnit NuGet packages',
                        command: 'dotnet add package NUnit && dotnet add package NUnit3TestAdapter'
                    }]);
                }
            } else if (testFramework === 'mstest') {
                if (!content.includes('MSTest')) {
                    this.addIssue(
                        project.name,
                        'analysis',
                        'warning',
                        'MISSING_PACKAGE',
                        'Missing MSTest framework',
                        'MSTest'
                    );
                    this.addRemediation('MISSING_PACKAGE', [{
                        title: 'Install MSTest',
                        description: 'Add MSTest NuGet packages',
                        command: 'dotnet add package MSTest.TestFramework && dotnet add package MSTest.TestAdapter'
                    }]);
                }
            }
        }
    }

    private async checkDotNetSdk(project: ProjectDescriptor, _projectPath: string): Promise<void> {
        try {
            const result = await execAsync('dotnet --version');
            logger.info(`Detected .NET SDK version: ${result.stdout.trim()}`);
        } catch (error) {
            this.addIssue(
                project.name,
                'env-setup',
                'error',
                'MISSING_DOTNET_SDK',
                '.NET SDK not installed or not in PATH',
                'Install .NET SDK to build and test C# projects'
            );

            // Add OS-specific remediation
            const platform = process.platform;
            if (platform === 'win32') {
                this.addRemediation('MISSING_DOTNET_SDK', [{
                    title: 'Install .NET SDK on Windows',
                    description: 'Download and install .NET SDK for Windows. Alternatives: choco install dotnet-sdk, or download from https://dotnet.microsoft.com/download',
                    command: 'winget install Microsoft.DotNet.SDK.8'
                }]);
            } else if (platform === 'darwin') {
                this.addRemediation('MISSING_DOTNET_SDK', [{
                    title: 'Install .NET SDK on macOS',
                    description: 'Install .NET SDK via Homebrew or download from https://dotnet.microsoft.com/download',
                    command: 'brew install --cask dotnet-sdk'
                }]);
            } else {
                this.addRemediation('MISSING_DOTNET_SDK', [{
                    title: 'Install .NET SDK on Linux',
                    description: 'Install .NET SDK via package manager. Alternatives: sudo snap install dotnet-sdk --classic, or download from https://dotnet.microsoft.com/download',
                    command: 'sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0'
                }]);
            }
        }
    }

    private async checkCoverageTool(project: ProjectDescriptor, projectPath: string): Promise<void> {
        const csprojFiles = await this.findCsprojFiles(projectPath);

        for (const csprojFile of csprojFiles) {
            const content = await readFile(csprojFile);

            // Check for coverlet.collector
            if (!content.includes('coverlet.collector') && !content.includes('coverlet.msbuild')) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'warning',
                    'MISSING_COVERAGE_TOOL',
                    'Missing coverlet for code coverage',
                    'coverlet.collector'
                );
                this.addRemediation('MISSING_COVERAGE_TOOL', [{
                    title: 'Install Coverlet',
                    description: 'Add coverlet.collector for code coverage',
                    command: 'dotnet add package coverlet.collector'
                }]);
            }
        }
    }

    private async findCsprojFiles(projectPath: string): Promise<string[]> {
        // Simple implementation: look for *.csproj files
        try {
            const files: string[] = [];
            const { stdout } = await execAsync(`find "${projectPath}" -maxdepth 2 -name "*.csproj"`);
            if (stdout.trim()) {
                files.push(...stdout.trim().split('\n'));
            }
            return files;
        } catch (error) {
            return [];
        }
    }

    private async installPackage(projectPath: string, packageName: string, issueCode: string): Promise<void> {
        try {
            const csprojFiles = await this.findCsprojFiles(projectPath);
            if (csprojFiles.length === 0) {
                logger.warn('No .csproj file found to add package to');
                return;
            }

            const csprojDir = path.dirname(csprojFiles[0]);
            await execAsync(`cd "${csprojDir}" && dotnet add package ${packageName}`);

            const action = {
                project: path.basename(projectPath),
                path: csprojFiles[0],
                command: `dotnet add package ${packageName}`,
                description: `Installed NuGet package: ${packageName}`,
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);
        } catch (error) {
            logger.error(`Failed to install package ${packageName}: ${error}`);
        }
    }

    private async createTestProject(projectPath: string, issueCode: string): Promise<void> {
        try {
            const testProjectName = `${path.basename(projectPath)}.Tests`;
            await execAsync(`cd "${projectPath}" && dotnet new xunit -n ${testProjectName}`);

            const action = {
                project: path.basename(projectPath),
                path: path.join(projectPath, testProjectName),
                command: `dotnet new xunit -n ${testProjectName}`,
                description: `Created test project: ${testProjectName}`,
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);
        } catch (error) {
            logger.error(`Failed to create test project: ${error}`);
        }
    }
}

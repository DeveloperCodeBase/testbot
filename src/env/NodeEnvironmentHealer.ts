import path from 'path';
import { EnvironmentHealer } from './EnvironmentHealer.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { fileExists, readFile, writeFile } from '../utils/fileUtils.js';
import logger from '../utils/logger.js';

/**
 * Healer for Node.js / TypeScript environments
 * Handles Jest and Vitest configurations and dependencies
 */
export class NodeEnvironmentHealer extends EnvironmentHealer {

    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing Node environment for ${project.name}`);

        // 1. Check dependencies
        await this.checkDependencies(project, projectPath, generatedFiles);

        // 2. Check Jest Configuration (if applicable)
        if (this.isJestProject(project, projectPath)) {
            await this.checkJestConfig(project, projectPath);
        }

        // 3. Check Vitest Configuration (if applicable)
        if (this.isVitestProject(project, projectPath)) {
            await this.checkVitestConfig(project, projectPath, generatedFiles);
        }
    }

    async heal(projectPath: string): Promise<void> {
        // Fix issues in order of severity/dependency

        // 1. Install missing dependencies
        const missingDeps = this.issues.filter(i => i.code === 'MISSING_DEV_DEP' && !i.autoFixed);
        for (const issue of missingDeps) {
            if (this.canInstallDependencies()) {
                // Extract package name from details or message
                // Format: "Missing devDependency: <package>"
                const pkg = issue.details;
                if (pkg) {
                    await this.installDependency(projectPath, pkg, issue.code);
                }
            }
        }

        // 2. Fix Jest Config
        const jestIssues = this.issues.filter(i => i.code === 'JEST_CONFIG_MISMATCH' && !i.autoFixed);
        for (const issue of jestIssues) {
            if (this.canUpdateConfig()) {
                await this.fixJestConfig(projectPath, issue.code);
            }
        }

        // 3. Fix Vitest Config
        const vitestIssues = this.issues.filter(i => i.code === 'VITEST_CONFIG_MISSING' && !i.autoFixed);
        for (const issue of vitestIssues) {
            if (this.canUpdateConfig()) {
                await this.fixVitestConfig(projectPath, issue.code);
            }
        }
    }

    private isJestProject(project: ProjectDescriptor, _projectPath: string): boolean {
        return project.testFramework === 'jest' ||
            project.framework === 'express' ||
            project.framework === 'nest';
    }

    private isVitestProject(project: ProjectDescriptor, _projectPath: string): boolean {
        return project.testFramework === 'vitest' ||
            project.framework === 'react' ||
            project.framework === 'vue';
    }

    private async checkDependencies(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (!(await fileExists(packageJsonPath))) return;

        const content = await readFile(packageJsonPath);
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Check for @testing-library/user-event if used in generated files
        const usesUserEvent = await this.filesContain(generatedFiles, '@testing-library/user-event');
        if (usesUserEvent && !allDeps['@testing-library/user-event']) {
            this.addIssue(
                project.name,
                'analysis',
                'warning',
                'MISSING_DEV_DEP',
                'Missing @testing-library/user-event dependency',
                '@testing-library/user-event'
            );
            this.addRemediation('MISSING_DEV_DEP', [{
                title: 'Install dependency',
                description: 'Install @testing-library/user-event as a dev dependency',
                command: 'npm install -D @testing-library/user-event'
            }]);
        }

        // Check for supertest if used in generated test files (for API testing)
        const usesSupertest = await this.filesContain(generatedFiles, 'supertest');
        if (usesSupertest && !allDeps['supertest']) {
            this.addIssue(
                project.name,
                'analysis',
                'warning',
                'MISSING_DEV_DEP',
                'Missing supertest dependency for API testing',
                'supertest @types/supertest'
            );
            this.addRemediation('MISSING_DEV_DEP', [{
                title: 'Install dependency',
                description: 'Install supertest and its types as dev dependencies',
                command: 'npm install -D supertest @types/supertest'
            }]);
        }

        // Check for @playwright/test if used in generated E2E tests
        const usesPlaywright = await this.filesContain(generatedFiles, '@playwright/test');
        if (usesPlaywright && !allDeps['@playwright/test']) {
            this.addIssue(
                project.name,
                'analysis',
                'warning',
                'MISSING_DEV_DEP',
                'Missing @playwright/test dependency for E2E testing',
                '@playwright/test'
            );
            this.addRemediation('MISSING_DEV_DEP', [{
                title: 'Install dependency',
                description: 'Install playwright test framework as a dev dependency',
                command: 'npm install -D @playwright/test'
            }]);
        }

        // Check for @testing-library/jest-dom if used
        const usesJestDom = await this.filesContain(generatedFiles, '@testing-library/jest-dom') ||
            await this.filesContain(generatedFiles, 'toBeInTheDocument');

        if (usesJestDom && !allDeps['@testing-library/jest-dom']) {
            this.addIssue(
                project.name,
                'analysis',
                'warning',
                'MISSING_DEV_DEP',
                'Missing @testing-library/jest-dom dependency',
                '@testing-library/jest-dom'
            );
            this.addRemediation('MISSING_DEV_DEP', [{
                title: 'Install dependency',
                description: 'Install @testing-library/jest-dom as a dev dependency',
                command: 'npm install -D @testing-library/jest-dom'
            }]);
        }

        // Check for Vitest specific dependencies
        if (this.isVitestProject(project, projectPath)) {
            if (!allDeps['vitest']) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'warning',
                    'MISSING_DEV_DEP',
                    'Missing vitest dependency',
                    'vitest'
                );
            }
            if (!allDeps['jsdom']) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'warning',
                    'MISSING_DEV_DEP',
                    'Missing jsdom dependency (required for React testing)',
                    'jsdom'
                );
            }
        }
    }

    private async checkJestConfig(project: ProjectDescriptor, projectPath: string): Promise<void> {
        // Check if config exists
        const configFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.json', 'package.json'];
        let configExists = false;

        for (const file of configFiles) {
            if (await fileExists(path.join(projectPath, file))) {
                if (file === 'package.json') {
                    const content = JSON.parse(await readFile(path.join(projectPath, file)));
                    if (content.jest) configExists = true;
                } else {
                    configExists = true;
                }
            }
        }

        if (!configExists) {
            // If no config, we might need to create one, but for now let's assume we only fix existing ones
            // or maybe we should create one? The prompt says "update config to include them"
            // Let's check if we have tests in src/__tests__
            return;
        }

        // Simple check: read jest.config.js and see if it has roots/testMatch covering src
        // This is a naive check (text based) for now as parsing JS config is hard
        const jestConfigPath = path.join(projectPath, 'jest.config.js');
        if (await fileExists(jestConfigPath)) {
            const content = await readFile(jestConfigPath);
            if (!content.includes('src') && !content.includes('__tests__')) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'warning',
                    'JEST_CONFIG_MISMATCH',
                    'Jest config might not cover src/__tests__',
                    jestConfigPath
                );
                this.addRemediation('JEST_CONFIG_MISMATCH', [{
                    title: 'Update Jest Config',
                    description: 'Ensure roots includes <rootDir>/src and testMatch covers **/__tests__/**/*.test.ts',
                    filePath: jestConfigPath
                }]);
            }
        }
    }

    private async checkVitestConfig(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        const setupTestsPath = path.join(projectPath, 'src/setupTests.ts');
        const vitestConfigPath = path.join(projectPath, 'vitest.config.ts');

        // Check if we need jest-dom setup
        const usesJestDom = await this.filesContain(generatedFiles, 'toBeInTheDocument');

        if (usesJestDom) {
            // Check setupTests.ts
            if (!(await fileExists(setupTestsPath))) {
                this.addIssue(
                    project.name,
                    'env-setup',
                    'warning',
                    'VITEST_SETUP_MISSING',
                    'Missing setupTests.ts for Vitest',
                    'src/setupTests.ts'
                );
                this.addRemediation('VITEST_SETUP_MISSING', [{
                    title: 'Create setupTests.ts',
                    description: 'Create src/setupTests.ts with jest-dom import',
                    command: 'echo "import \'@testing-library/jest-dom/vitest\';" > src/setupTests.ts'
                }]);
            } else {
                const content = await readFile(setupTestsPath);
                if (!content.includes('@testing-library/jest-dom')) {
                    this.addIssue(
                        project.name,
                        'env-setup',
                        'warning',
                        'VITEST_SETUP_MISSING',
                        'setupTests.ts missing jest-dom import',
                        'src/setupTests.ts'
                    );
                }
            }

            // Check vitest.config.ts for setupFiles
            if (await fileExists(vitestConfigPath)) {
                const content = await readFile(vitestConfigPath);
                if (!content.includes('setupFiles')) {
                    this.addIssue(
                        project.name,
                        'env-setup',
                        'warning',
                        'VITEST_CONFIG_MISSING',
                        'vitest.config.ts missing setupFiles configuration',
                        'vitest.config.ts'
                    );
                    this.addRemediation('VITEST_CONFIG_MISSING', [{
                        title: 'Update vitest.config.ts',
                        description: 'Add setupFiles: ["./src/setupTests.ts"] to test configuration',
                        filePath: 'vitest.config.ts'
                    }]);
                }
            }
        }
    }

    private async installDependency(projectPath: string, pkg: string, issueCode: string): Promise<void> {
        const action = await this.executeCommand(
            `npm install -D ${pkg}`,
            projectPath,
            `Install ${pkg}`,
            path.basename(projectPath)
        );

        if (action.success) {
            this.markIssueFixed(issueCode, [action]);
        }
    }

    private async fixJestConfig(projectPath: string, issueCode: string): Promise<void> {
        const jestConfigPath = path.join(projectPath, 'jest.config.js');
        if (await fileExists(jestConfigPath)) {
            let content = await readFile(jestConfigPath);
            let modified = false;

            // Add roots if missing
            if (!content.includes('roots:')) {
                content = content.replace('module.exports = {', 'module.exports = {\n  roots: ["<rootDir>/src", "<rootDir>/tests"],');
                modified = true;
            }

            // Add testMatch patterns to support unit, integration, and E2E tests
            if (!content.includes('testMatch:')) {
                const testMatchPattern = `testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.js",
    "**/*.test.ts",
    "**/*.test.js",
    "**/*.integration.test.ts",
    "**/*.integration.test.js",
    "**/*.e2e.test.ts",
    "**/*.e2e.test.js"
  ],`;
                content = content.replace('module.exports = {', `module.exports = {\n  ${testMatchPattern}`);
                modified = true;
            }

            if (modified) {
                await writeFile(jestConfigPath, content);

                const action = {
                    project: path.basename(projectPath),
                    path: jestConfigPath,
                    command: 'update-file',
                    description: 'Updated jest.config.js with roots and comprehensive testMatch patterns',
                    success: true,
                    timestamp: new Date().toISOString()
                };
                this.actions.push(action);
                this.markIssueFixed(issueCode, [action]);
            }
        }
    }

    private async fixVitestConfig(projectPath: string, issueCode: string): Promise<void> {
        if (issueCode === 'VITEST_SETUP_MISSING') {
            const setupTestsPath = path.join(projectPath, 'src/setupTests.ts');

            // Create or update setupTests.ts
            if (!(await fileExists(setupTestsPath))) {
                await writeFile(setupTestsPath, "import '@testing-library/jest-dom/vitest';\n");
                const action = {
                    project: path.basename(projectPath),
                    path: setupTestsPath,
                    command: 'create-file',
                    description: 'Created src/setupTests.ts',
                    success: true,
                    timestamp: new Date().toISOString()
                };
                this.actions.push(action);
                this.markIssueFixed(issueCode, [action]);
            } else {
                // Append import
                const content = await readFile(setupTestsPath);
                if (!content.includes('@testing-library/jest-dom')) {
                    await writeFile(setupTestsPath, "import '@testing-library/jest-dom/vitest';\n" + content);
                    const action = {
                        project: path.basename(projectPath),
                        path: setupTestsPath,
                        command: 'update-file',
                        description: 'Added jest-dom import to src/setupTests.ts',
                        success: true,
                        timestamp: new Date().toISOString()
                    };
                    this.actions.push(action);
                    this.markIssueFixed(issueCode, [action]);
                }
            }
        } else if (issueCode === 'VITEST_CONFIG_MISSING') {
            const vitestConfigPath = path.join(projectPath, 'vitest.config.ts');
            if (await fileExists(vitestConfigPath)) {
                let content = await readFile(vitestConfigPath);
                // Naive replacement to add setupFiles
                if (!content.includes('setupFiles')) {
                    // Try to find test: { ... } block
                    if (content.includes('test: {')) {
                        content = content.replace('test: {', 'test: {\n    globals: true,\n    environment: "jsdom",\n    setupFiles: ["./src/setupTests.ts"],');
                    } else if (content.includes('defineConfig({')) {
                        content = content.replace('defineConfig({', 'defineConfig({\n  test: {\n    globals: true,\n    environment: "jsdom",\n    setupFiles: ["./src/setupTests.ts"],\n  },');
                    }

                    await writeFile(vitestConfigPath, content);

                    const action = {
                        project: path.basename(projectPath),
                        path: vitestConfigPath,
                        command: 'update-file',
                        description: 'Updated vitest.config.ts with setupFiles',
                        success: true,
                        timestamp: new Date().toISOString()
                    };
                    this.actions.push(action);
                    this.markIssueFixed(issueCode, [action]);
                }
            }
        }
    }

    private async filesContain(files: string[], term: string): Promise<boolean> {
        for (const file of files) {
            if (await fileExists(file)) {
                const content = await readFile(file);
                if (content.includes(term)) return true;
            }
        }
        return false;
    }
}

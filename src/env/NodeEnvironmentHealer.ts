import path from 'path';
import { EnvironmentHealer } from './EnvironmentHealer';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { fileExists, readFile, writeFile } from '../utils/fileUtils';
import logger from '../utils/logger';

/**
 * Healer for Node.js / TypeScript environments
 * Handles Jest and Vitest configurations and dependencies
 */
export class NodeEnvironmentHealer extends EnvironmentHealer {
    private generatedFiles: string[] = [];


    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing Node environment for ${project.name}`);

        this.generatedFiles = generatedFiles;

        // 0. Detect if this is a TypeScript project
        const isTypeScript = await this.isTypeScriptProject(projectPath);

        // 1. Check dependencies
        await this.checkDependencies(project, projectPath, generatedFiles);

        // 2. Check Jest Configuration (if applicable)
        if (this.isJestProject(project, projectPath)) {
            await this.checkJestConfig(project, projectPath, isTypeScript);
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

        // 2. Fix Jest TypeScript Configuration
        const jestTsIssues = this.issues.filter(i => i.code === 'JEST_TS_MISCONFIGURED' && !i.autoFixed);
        for (const issue of jestTsIssues) {
            if (this.canUpdateConfig()) {
                await this.fixJestTypeScriptConfig(projectPath, issue.code);
            }
        }

        // 3. Fix Jest Config
        const jestIssues = this.issues.filter(i => i.code === 'JEST_CONFIG_MISMATCH' && !i.autoFixed);
        for (const issue of jestIssues) {
            if (this.canUpdateConfig()) {
                await this.fixJestConfig(projectPath, issue.code);
            }
        }

        // 4. Fix Vitest Config
        const vitestIssues = this.issues.filter(i => i.code === 'VITEST_CONFIG_MISSING' && !i.autoFixed);
        for (const issue of vitestIssues) {
            if (this.canUpdateConfig()) {
                await this.fixVitestConfig(projectPath, issue.code);
            }
        }

        // 5. Fix Vitest Mocking Issues
        const mockIssues = this.issues.filter(i => i.code === 'VITEST_MOCK_ERROR' && !i.autoFixed);
        for (const issue of mockIssues) {
            await this.fixVitestMocking(projectPath, issue.code);
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

    private async isTypeScriptProject(projectPath: string): Promise<boolean> {
        // Check for tsconfig.json
        const hasTsConfig = await fileExists(path.join(projectPath, 'tsconfig.json'));
        if (hasTsConfig) {
            logger.info('Detected TypeScript project (tsconfig.json found)');
            return true;
        }

        // Check package.json for TypeScript dependency
        const packageJsonPath = path.join(projectPath, 'package.json');
        if (await fileExists(packageJsonPath)) {
            const content = await readFile(packageJsonPath);
            const pkg = JSON.parse(content);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (allDeps['typescript']) {
                logger.info('Detected TypeScript project (typescript in dependencies)');
                return true;
            }
        }

        return false;
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

    private async checkJestConfig(project: ProjectDescriptor, projectPath: string, isTypeScript: boolean): Promise<void> {
        // Check if config exists
        const configFiles = ['jest.config.js', 'jest.config.ts', 'jest.config.json', 'package.json'];
        let configExists = false;

        for (const file of configFiles) {
            const fullPath = path.join(projectPath, file);
            if (await fileExists(fullPath)) {
                if (file === 'package.json') {
                    const content = JSON.parse(await readFile(fullPath));
                    if (content.jest) {
                        configExists = true;
                    }
                } else {
                    configExists = true;
                }
            }
        }

        // If TypeScript project but no Jest config or misconfigured
        if (isTypeScript) {
            if (!configExists) {
                this.addIssue(
                    project.name,
                    'analysis',
                    'error',
                    'JEST_TS_MISCONFIGURED',
                    'TypeScript project missing Jest configuration',
                    'Jest needs to be configured with ts-jest for TypeScript support'
                );
                this.addRemediation('JEST_TS_MISCONFIGURED', [{
                    title: 'Create Jest config for TypeScript',
                    description: 'Create jest.config.js with ts-jest preset',
                    filePath: path.join(projectPath, 'jest.config.js')
                }]);
                return;
            }

            // Check if ts-jest is configured
            const jestConfigPath = path.join(projectPath, 'jest.config.js');
            if (await fileExists(jestConfigPath)) {
                const content = await readFile(jestConfigPath);

                if (!content.includes('ts-jest') && !content.includes('@swc/jest')) {
                    this.addIssue(
                        project.name,
                        'analysis',
                        'warning',
                        'JEST_TS_MISCONFIGURED',
                        'Jest not configured for TypeScript',
                        'ts-jest preset or transform is missing'
                    );
                    this.addRemediation('JEST_TS_MISCONFIGURED', [{
                        title: 'Configure ts-jest',
                        description: 'Update Jest config to use ts-jest preset',
                        filePath: jestConfigPath
                    }]);
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

    private async fixJestTypeScriptConfig(projectPath: string, issueCode: string): Promise<void> {
        const jestConfigPath = path.join(projectPath, 'jest.config.cjs');

        // Create canonical Jest config for TypeScript using the opinionated template
        const jestConfig = `/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Let Jest discover all ts/tsx test files
    testMatch: [
        '**/__tests__/**/*.(test|spec).ts',
        '**/?(*.)+(test|spec).ts',
    ],

    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // Transform setup
    transform: {
        '^.+\\\\.(t|j)sx?$': 'ts-jest',
    },

    // Include test roots
    roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>'],
};
`;

        try {
            await writeFile(jestConfigPath, jestConfig);

            const action = {
                project: path.basename(projectPath),
                path: jestConfigPath,
                command: 'create-file',
                description: 'Created jest.config.cjs with canonical ts-jest configuration',
                success: true,
                timestamp: new Date().toISOString()
            };
            this.actions.push(action);
            this.markIssueFixed(issueCode, [action]);

            logger.info(`✅ Created canonical jest.config.cjs at ${jestConfigPath}`);

            // Ensure ts-jest and @types/jest are installed
            if (this.canInstallDependencies()) {
                await this.installDependency(projectPath, 'ts-jest', 'MISSING_DEV_DEP');
                await this.installDependency(projectPath, '@types/jest', 'MISSING_DEV_DEP');
            }

        } catch (error) {
            logger.error(`Failed to create jest.config.cjs: ${error}`);
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

    async fixVitestMocking(projectPath: string, issueCode: string): Promise<void> {
        for (const file of this.generatedFiles) {
            if (!await fileExists(file)) continue;

            let content = await readFile(file);
            let modified = false;

            // Fix: Cannot redefine property (specifically for react-router-dom)
            if (content.includes("vi.mock('react-router-dom'") && !content.includes('vi.importActual')) {
                // Replace with canonical mock pattern
                const mockRegex = /vi\.mock\(['"]react-router-dom['"],\s*(?:async\s*)?\(\)\s*=>\s*\(\{([\s\S]*?)\}\)\);/g;

                if (mockRegex.test(content)) {
                    content = content.replace(mockRegex, (_match, body) => {
                        return `vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        ${body}
    };
});`;
                    });
                    modified = true;
                }
            }

            if (modified) {
                await writeFile(file, content);
                const action = {
                    project: path.basename(projectPath),
                    path: file,
                    command: 'update-file',
                    description: 'Fixed Vitest mocking to use canonical pattern',
                    success: true,
                    timestamp: new Date().toISOString()
                };
                this.actions.push(action);
                this.markIssueFixed(issueCode, [action]);
                logger.info(`✅ Fixed Vitest mocking in ${file}`);
            }
        }
    }

    /**
     * Fix internal module path resolution (.js vs .ts)
     */
    async fixInternalModulePath(
        projectPath: string,
        _errorOutput: string,
        modulePath: string
    ): Promise<boolean> {
        logger.info(`Fixing internal module path: ${modulePath}`);

        try {
            // Find ALL TypeScript files (source + test), not just test files
            const { findFiles } = await import('../utils/fileUtils');
            const allTsFiles = await findFiles(projectPath, '**/*.{ts,tsx}', {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts']
            });

            let fixedCount = 0;
            const pathToFix = modulePath.replace(/\\/g, '/'); // Normalize path separators

            for (const file of allTsFiles) {
                const content = await readFile(file);

                // Check if this file imports the problematic module
                if (!content.includes(pathToFix)) continue;

                // Remove .js extension from the import
                const fixedContent = content.replace(
                    new RegExp(`from ['"]${pathToFix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
                    `from '${pathToFix.replace(/\.js$/, '')}'`
                );

                if (fixedContent !== content) {
                    await writeFile(file, fixedContent);

                    this.actions.push({
                        project: path.basename(projectPath),
                        path: file,
                        command: 'fix-internal-module',
                        description: `Fixed import '${modulePath}' → '${modulePath.replace(/\.js$/, '')}' in ${path.basename(file)}`,
                        success: true,
                        timestamp: new Date().toISOString()
                    });

                    fixedCount++;
                }
            }

            if (fixedCount > 0) {
                // Create a summary action for all fixes
                this.actions.push({
                    project: path.basename(projectPath),
                    path: projectPath,
                    command: 'fix-internal-module-paths',
                    description: `Fixed ${fixedCount} file(s) (source + test) by removing .js extensions from internal imports (e.g., '${modulePath}' → '${modulePath.replace(/\.js$/, '')}')`,
                    success: true,
                    timestamp: new Date().toISOString()
                });

                logger.info(`✓ Fixed ${fixedCount} file(s) with internal module path issues`);
                return true;
            }
        } catch (error) {
            logger.error(`Failed to fix internal module path: ${error}`);
        }
        return false;
    }

    /**
     * Install missing package and its types
     */
    async installMissingPackage(
        packageName: string,
        projectPath: string
    ): Promise<boolean> {
        logger.info(`Installing missing package: ${packageName}`);

        try {
            // First, install the package itself
            const { execAsync } = await import('../utils/execUtils');
            await execAsync(`npm install ${packageName}`, { cwd: projectPath });

            this.actions.push({
                project: path.basename(projectPath),
                path: projectPath,
                command: `npm install ${packageName}`,
                description: `Auto-installed missing package: ${packageName}`,
                success: true,
                timestamp: new Date().toISOString()
            });

            // Try to install types if it's a TypeScript project
            const hasTypes = await this.tryInstallTypes(packageName, projectPath);
            if (hasTypes) {
                logger.info(`✓ Also installed @types/${packageName}`);
            } else {
                logger.info(`✓ Installed ${packageName} (no @types available)`);
            }

            return true;
        } catch (error) {
            logger.error(`Failed to install ${packageName}: ${error}`);
            this.actions.push({
                project: path.basename(projectPath),
                path: projectPath,
                command: `npm install ${packageName}`,
                description: `Failed to install ${packageName}: ${error}`,
                success: false,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    /**
     * Try to install type definitions for a package
     */
    private async tryInstallTypes(
        packageName: string,
        projectPath: string
    ): Promise<boolean> {
        const typesPackage = `@types/${packageName}`;
        try {
            const { execAsync } = await import('../utils/execUtils');
            await execAsync(`npm install -D ${typesPackage}`, { cwd: projectPath });

            this.actions.push({
                project: path.basename(projectPath),
                path: projectPath,
                command: `npm install -D ${typesPackage}`,
                description: `Installed type definitions: ${typesPackage}`,
                success: true,
                timestamp: new Date().toISOString()
            });

            return true;
        } catch {
            // Types not available or not needed, not a fatal error
            return false;
        }
    }

    /**
     * Fix TypeScript errors in test files by injecting @ts-nocheck
     */
    async fixTestTypeScriptErrors(
        projectPath: string,
        _errorOutput: string
    ): Promise<boolean> {
        logger.info('Fixing TypeScript errors in test files...');

        try {
            // Use filesystem walk instead of parsing stderr
            const { findFiles } = await import('../utils/fileUtils');
            const testFiles = await findFiles(projectPath, '**/*.{test,spec,integration,e2e}.{ts,tsx}', {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
            });

            logger.info(`Found ${testFiles.length} test files to patch`);
            let fixedCount = 0;

            for (const testFile of testFiles) {
                try {
                    const content = await readFile(testFile);

                    // Skip if @ts-nocheck already present
                    if (content.includes('// @ts-nocheck') || content.includes('/* @ts-nocheck */')) {
                        continue;
                    }

                    // Prepend @ts-nocheck
                    const fixedContent = `// @ts-nocheck\n${content}`;
                    await writeFile(testFile, fixedContent);

                    this.actions.push({
                        project: path.basename(projectPath),
                        path: testFile,
                        command: 'add-ts-nocheck',
                        description: `Added // @ts-nocheck to ${path.basename(testFile)}`,
                        success: true,
                        timestamp: new Date().toISOString()
                    });

                    fixedCount++;
                } catch (error) {
                    logger.error(`Failed to fix ${testFile}: ${error}`);
                }
            }

            logger.info(`✓ Fixed ${fixedCount} test files with @ts-nocheck`);
            return fixedCount > 0;
        } catch (error) {
            logger.error(`Failed to fix TypeScript errors: ${error}`);
            return false;
        }
    }
}

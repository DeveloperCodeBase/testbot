// @ts-nocheck
import { NodeAdapter } from './NodeAdapter';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import path from 'path';
import { readFile } from '../utils/fileUtils';
import { CoverageReport, CoverageSummary, FileCoverage } from '../models/CoverageReport';

jest.mock('../utils/fileUtils');

describe('NodeAdapter', () => {
    let adapter: NodeAdapter;
    let project: ProjectDescriptor;

    beforeEach(() => {
        adapter = new NodeAdapter();
        project = {
            language: 'javascript',
            testFramework: 'jest',
            buildTool: undefined,
            framework: undefined,
            packageManager: 'npm',
        };
    });

    it('should handle JavaScript projects', () => {
        expect(adapter.canHandle(project)).toBe(true);
    });

    it('should handle TypeScript projects', () => {
        project.language = 'typescript';
        expect(adapter.canHandle(project)).toBe(true);
    });

    it('should not handle other languages', () => {
        project.language = 'java';
        expect(adapter.canHandle(project)).toBe(false);
    });

    it('should default to Jest if no test framework is provided', () => {
        project.testFramework = undefined;
        expect(adapter.getTestFramework(project)).toBe('jest');
    });

    it('should return the correct build command for TypeScript projects', () => {
        project.language = 'typescript';
        expect(adapter.getBuildCommand(project)).toBe('npm run build');
    });

    it('should return null for JavaScript projects', () => {
        project.language = 'javascript';
        expect(adapter.getBuildCommand(project)).toBeNull();
    });

    it('should return the correct test command for Jest', () => {
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm test -- --testPathPattern="src/.*__tests__"');
    });

    it('should return the correct test command for Jest with integration tests', () => {
        expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --testPathPattern=".*\\.integration\\.test"');
    });

    it('should return the correct test command for Jest with e2e tests', () => {
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --testPathPattern="e2e"');
    });

    it('should return the correct test command for Mocha', () => {
        project.testFramework = 'mocha';
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm test');
    });

    it('should return the correct test command for Mocha with integration tests', () => {
        project.testFramework = 'mocha';
        expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --grep integration');
    });

    it('should return the correct test command for Mocha with e2e tests', () => {
        project.testFramework = 'mocha';
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --grep e2e');
    });

    it('should return the correct test command for Vitest', () => {
        project.testFramework = 'vitest';
        expect(adapter.getTestCommand(project, 'unit')).toBe('npx vitest run');
    });

    it('should return the correct coverage command for Jest', () => {
        expect(adapter.getCoverageCommand(project)).toBe('npm test -- --coverage --coverageReporters=json-summary --coverageReporters=json');
    });

    it('should return the correct coverage command for Vitest', () => {
        project.testFramework = 'vitest';
        expect(adapter.getCoverageCommand(project)).toBe('npm run test -- --coverage');
    });

    it('should return the correct test file path for unit tests in JavaScript', () => {
        expect(adapter.getTestFilePath('src/main/com/example/Foo.js', 'unit', project)).toBe('tests/unit/Foo.test.js');
    });

    it('should return the correct test file path for unit tests in TypeScript', () => {
        project.language = 'typescript';
        expect(adapter.getTestFilePath('src/main/com/example/Foo.ts', 'unit', project)).toBe('tests/unit/Foo.test.ts');
    });

    it('should return the correct test file path for integration tests in JavaScript', () => {
        expect(adapter.getTestFilePath('src/main/com/example/Foo.js', 'integration', project)).toBe('tests/integration/Foo.integration.test.js');
    });

    it('should return the correct test file path for integration tests in TypeScript', () => {
        project.language = 'typescript';
        expect(adapter.getTestFilePath('src/main/com/example/Foo.ts', 'integration', project)).toBe('tests/integration/Foo.integration.test.ts');
    });

    it('should return the correct test file path for e2e tests in JavaScript', () => {
        expect(adapter.getTestFilePath('src/main/com/example/Foo.js', 'e2e', project)).toBe('tests/e2e/Foo.e2e.test.js');
    });

    it('should return the correct test file path for e2e tests in TypeScript', () => {
        project.language = 'typescript';
        expect(adapter.getTestFilePath('src/main/com/example/Foo.ts', 'e2e', project)).toBe('tests/e2e/Foo.e2e.test.ts');
    });

    it('should return the correct test file path for React unit tests in JavaScript', () => {
        project.framework = 'react';
        expect(adapter.getTestFilePath('src/main/com/example/Foo.js', 'unit', project)).toBe('src/tests/unit/Foo.test.jsx');
    });

    it('should return the correct test directory for React projects', () => {
        project.framework = 'react';
        expect(adapter.getTestDirectory(project, 'unit')).toBe('src');
    });

    it('should return the correct test directory for Vitest projects', () => {
        project.testFramework = 'vitest';
        expect(adapter.getTestDirectory(project, 'unit')).toBe('src');
    });

    it('should return the correct test directory for other frameworks', () => {
        expect(adapter.getTestDirectory(project, 'unit')).toBe('.');
    });

    it('should return the correct test file pattern for unit tests', () => {
        expect(adapter.getTestFilePattern('unit')).toBe('**/{__tests__,tests}/**/*.test.{ts,js,tsx,jsx}');
    });

    it('should return the correct test file pattern for integration tests', () => {
        expect(adapter.getTestFilePattern('integration')).toBe('**/*.integration.test.{ts,js,tsx,jsx}');
    });

    it('should return the correct test file pattern for e2e tests', () => {
        expect(adapter.getTestFilePattern('e2e')).toBe('**/*.e2e.{ts,js,tsx,jsx}');
    });

    it('should parse coverage effectively with Jest', async () => {
        const coverageOutput = 'dummy coverage output';
        const projectPath = '/path/to/project';
        const summaryContent = JSON.stringify({
            total: {
                statements: { total: 100, covered: 80, pct: 80 },
                functions: { total: 50, covered: 40, pct: 80 },
                branches: { total: 20, covered: 10, pct: 50 },
                lines: { total: 75, covered: 60, pct: 80 },
            },
            'src/main/com/example/Foo.js': {
                statements: { total: 40, covered: 30, pct: 75 },
                functions: { total: 20, covered: 10, pct: 50 },
                branches: { total: 10, covered: 5, pct: 50 },
                lines: { total: 30, covered: 20, pct: 66.67 },
            },
        });
        (readFile as jest.Mock).mockResolvedValue(summaryContent);
        const result = await adapter.parseCoverage(coverageOutput, projectPath);
        expect(result).toEqual({
            overall: {
                statements: { total: 100, covered: 80, percentage: 80 },
                functions: { total: 50, covered: 40, percentage: 80 },
                branches: { total: 20, covered: 10, percentage: 50 },
                lines: { total: 75, covered: 60, percentage: 80 },
            },
            files: [
                {
                    path: 'src/main/com/example/Foo.js',
                    lines: { total: 40, covered: 30, percentage: 75 },
                    functions: { total: 20, covered: 10, percentage: 50 },
                    branches: { total: 10, covered: 5, percentage: 50 },
                    statements: { total: 30, covered: 20, percentage: 66.67 },
                    uncoveredLines: [],
                },
            ],
            timestamp: expect.any(String),
        });
    });

    it('should throw an error if coverage parsing fails', async () => {
        const coverageOutput = 'dummy coverage output';
        const projectPath = '/path/to/project';
        (readFile as jest.Mock).mockRejectedValue(new Error('Failed to read file'));
        await expect(adapter.parseCoverage(coverageOutput, projectPath)).rejects.toThrow('Failed to parse coverage: Error: Failed to read file');
    });

    it('should convert coverage data effectively', () => {
        const data = {
            total: 100,
            covered: 80,
            pct: 80,
        };
        expect(adapter.convertCoverage(data)).toEqual({
            total: 100,
            covered: 80,
            percentage: 80,
        });
    });

    it('should handle missing coverage data effectively', () => {
        expect(adapter.convertCoverage(undefined)).toEqual({
            total: 0,
            covered: 0,
            percentage: 0,
        });
    });

    it('should return the correct package manager', () => {
        project.packageManager = 'yarn';
        expect(adapter.getPackageManager(project)).toBe('yarn');
    });

    it('should default to npm if no package manager is specified', () => {
        project.packageManager = undefined;
        expect(adapter.getPackageManager(project)).toBe('npm');
    });
});
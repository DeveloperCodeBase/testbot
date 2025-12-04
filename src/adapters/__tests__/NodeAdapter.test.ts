// @ts-nocheck
import path from 'path';
import { NodeAdapter } from '../NodeAdapter';
import { ProjectDescriptor } from '../../models/ProjectDescriptor';
import * as fileUtils from '../../utils/fileUtils';

jest.mock('../../utils/fileUtils');

describe('NodeAdapter', () => {
  let adapter: NodeAdapter;

  beforeEach(() => {
    adapter = new NodeAdapter();
    jest.clearAllMocks();
  });

  describe('language property', () => {
    it('should return language as javascript', () => {
      expect(adapter.language).toBe('javascript');
    });
  });

  describe('canHandle', () => {
    it('returns true for javascript language', () => {
      expect(adapter.canHandle({ language: 'javascript' } as any)).toBe(true);
    });

    it('returns true for typescript language', () => {
      expect(adapter.canHandle({ language: 'typescript' } as any)).toBe(true);
    });

    it('returns false for other language', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
    });

    it('returns false when language not defined', () => {
      expect(adapter.canHandle({} as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('returns project testFramework if defined', () => {
      expect(adapter.getTestFramework({ testFramework: 'mocha' } as any)).toBe('mocha');
    });

    it('returns jest as default', () => {
      expect(adapter.getTestFramework({} as any)).toBe('jest');
    });
  });

  describe('getBuildCommand', () => {
    it('returns build command if language is typescript', () => {
      const project = { language: 'typescript', packageManager: 'yarn' } as ProjectDescriptor;
      jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('yarn');
      expect(adapter.getBuildCommand(project)).toBe('yarn run build');
    });

    it('returns npm run build if packageManager not specified', () => {
      const project = { language: 'typescript' } as ProjectDescriptor;
      expect(adapter.getBuildCommand(project)).toBe('npm run build');
    });

    it('returns null if language not typescript', () => {
      const project = { language: 'javascript' } as ProjectDescriptor;
      expect(adapter.getBuildCommand(project)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    const testTypes: ('unit' | 'integration' | 'e2e')[] = ['unit', 'integration', 'e2e'];

    describe('when using react framework', () => {
      const project: ProjectDescriptor = {
        framework: 'react',
        packageManager: 'npm',
      };

      it('returns npm run scripts for different test types', () => {
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm run test:unit');
        expect(adapter.getTestCommand(project, 'integration')).toBe('npm run test:integration');
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npm run test:e2e');
      });
    });

    describe('when using jest test framework', () => {
      const project: ProjectDescriptor = {
        testFramework: 'jest',
        packageManager: 'npm',
      };
      beforeEach(() => {
        jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
        jest.spyOn(adapter, 'getTestFramework').mockReturnValue('jest');
      });

      it('returns correct test commands by testType', () => {
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm test -- --testPathPattern="src/.*__tests__"');
        expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --testPathPattern=".*\\.integration\\.test"');
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --testPathPattern="e2e"');
      });
    });

    describe('when using mocha test framework', () => {
      const project: ProjectDescriptor = {
        testFramework: 'mocha',
        packageManager: 'npm',
      };
      beforeEach(() => {
        jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
        jest.spyOn(adapter, 'getTestFramework').mockReturnValue('mocha');
      });

      it('returns correct test commands by testType', () => {
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm test');
        expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --grep integration');
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --grep e2e');
      });
    });

    describe('when using vitest test framework', () => {
      it('returns npx vitest run command for vitest framework', () => {
        const project: ProjectDescriptor = {
          testFramework: 'vitest',
          packageManager: 'npm',
        };
        jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
        jest.spyOn(adapter, 'getTestFramework').mockReturnValue('vitest');

        expect(adapter.getTestCommand(project, 'unit')).toBe('npx vitest run');
        expect(adapter.getTestCommand(project, 'integration')).toBe('npx vitest run');
        expect(adapter.getTestCommand(project, 'e2e')).toBe('npx vitest run');
      });

      it('returns npx vitest run command for react framework too (fallback)', () => {
        const project: ProjectDescriptor = {
          framework: 'react',
          packageManager: 'npm',
          testFramework: 'react',
        };
        jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
        jest.spyOn(adapter, 'getTestFramework').mockReturnValue('react');

        expect(adapter.getTestCommand(project, 'unit')).toBe('npm run test:unit');
      });
    });

    describe('fallback behavior', () => {
      it('returns default npm test command for unknown testFramework', () => {
        const project: ProjectDescriptor = {
          testFramework: 'unknown',
          packageManager: 'npm',
        };
        jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
        jest.spyOn(adapter, 'getTestFramework').mockReturnValue('unknown');
        expect(adapter.getTestCommand(project, 'unit')).toBe('npm test');
      });
    });
  });

  describe('getCoverageCommand', () => {
    it('returns coverage command for jest framework', () => {
      const project: ProjectDescriptor = {
        testFramework: 'jest',
        packageManager: 'yarn',
      };
      jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('yarn');
      jest.spyOn(adapter, 'getTestFramework').mockReturnValue('jest');
      expect(adapter.getCoverageCommand(project)).toBe(
        'yarn test -- --coverage --coverageReporters=json-summary --coverageReporters=json',
      );
    });

    it('returns coverage command for vitest framework', () => {
      const project: ProjectDescriptor = {
        testFramework: 'vitest',
        packageManager: 'npm',
      };
      jest.spyOn(adapter as any, 'getPackageManager').mockReturnValue('npm');
      jest.spyOn(adapter, 'getTestFramework').mockReturnValue('vitest');
      expect(adapter.getCoverageCommand(project)).toBe('npm run test -- --coverage');
    });

    it('returns null if unsupported framework', () => {
      jest.spyOn(adapter, 'getTestFramework').mockReturnValue('mocha');
      expect(adapter.getCoverageCommand({ packageManager: 'npm' } as any)).toBeNull();
    });
  });

  describe('getTestFilePath', () => {
    it('returns jsx extension when source ends with .ts and react framework for unit test', () => {
      const sourceFile = 'src/somefile.ts';
      const project = { framework: 'react' } as ProjectDescriptor;

      const expected = path.join('src', 'tests', 'unit', 'somefile.test.tsx');
      expect(adapter.getTestFilePath(sourceFile, 'unit', project)).toBe(expected);
    });

    it('returns proper path for integration test under react framework', () => {
      const sourceFile = 'app/component.ts';
      const project = { framework: 'react' } as ProjectDescriptor;
      const expected = path.join('src', 'tests', 'integration', 'component.test.tsx');
      expect(adapter.getTestFilePath(sourceFile, 'integration', project)).toBe(expected);
    });

    it('returns proper path for e2e test under react framework', () => {
      const sourceFile = 'lib/util.ts';
      const project = { framework: 'react' } as ProjectDescriptor;
      const expected = path.join('src', 'tests', 'e2e', 'util.test.tsx');
      expect(adapter.getTestFilePath(sourceFile, 'e2e', project)).toBe(expected);
    });

    it('returns .ts suffix and correct naming for non-react unit test', () => {
      const sourceFile = 'lib/util.ts';
      const project = {} as ProjectDescriptor;
      expect(adapter.getTestFilePath(sourceFile, 'unit', project)).toBe(path.join('tests', 'unit', 'util.test.ts'));
    });

    it('returns .js suffix for .js sourceFile with correct naming', () => {
      const sourceFile = 'index.js';
      const project = {} as ProjectDescriptor;
      expect(adapter.getTestFilePath(sourceFile, 'integration', project)).toBe(path.join('tests', 'integration', 'index.integration.test.js'));
    });

    it('returns .e2e.test.js for js e2e test', () => {
      const sourceFile = 'server.js';
      const project = {} as ProjectDescriptor;
      expect(adapter.getTestFilePath(sourceFile, 'e2e', project)).toBe(path.join('tests', 'e2e', 'server.e2e.test.js'));
    });

    it('fallback returns sourceFile.test.ext with correct extension', () => {
      // @ts-expect-error testing fallback
      expect(adapter.getTestFilePath('foo.ts', 'unknown', { framework: 'react' } as any)).toBe('foo.test.tsx');
      // fallback without react framework
      // @ts-expect-error testing fallback
      expect(adapter.getTestFilePath('foo.js', 'unknown', {} as any)).toBe('foo.test.js');
    });
  });

  describe('getTestDirectory', () => {
    it('returns src for react framework', () => {
      expect(adapter.getTestDirectory({ framework: 'react' } as any, 'unit')).toBe('src');
    });

    it('returns src for vitest testFramework', () => {
      expect(adapter.getTestDirectory({ testFramework: 'vitest' } as any, 'unit')).toBe('src');
    });

    it('returns "." for other configurations', () => {
      expect(adapter.getTestDirectory({}, 'unit')).toBe('.');
    });
  });

  describe('getTestFilePattern', () => {
    it('returns correct patterns for unit', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/{__tests__,tests}/**/*.test.{ts,js,tsx,jsx}');
    });

    it('returns correct patterns for integration', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*.integration.test.{ts,js,tsx,jsx}');
    });

    it('returns correct patterns for e2e', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('**/*.e2e.{ts,js,tsx,jsx}');
    });

    it('returns default pattern for unknown testType', () => {
      // @ts-expect-error invalid testType
      expect(adapter.getTestFilePattern('unknown')).toBe('**/*.test.{ts,js,tsx,jsx}');
    });
  });

  describe('parseCoverage', () => {
    const mockReadFile = fileUtils.readFile as jest.Mock;
    const fakeTimestamp = new Date(2023, 4, 10);

    beforeAll(() => {
      jest.useFakeTimers('modern');
      jest.setSystemTime(fakeTimestamp);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('parses coverage-summary.json and returns CoverageReport', async () => {
      const projectPath = '/my/project';
      const coverageData = JSON.stringify({
        total: {
          lines: { total: 10, covered: 8, pct: 80 },
          functions: { total: 5, covered: 4, pct: 80 },
          branches: { total: 4, covered: 3, pct: 75 },
          statements: { total: 10, covered: 8, pct: 80 },
        },
        'src/file1.js': {
          lines: { total: 5, covered: 5, pct: 100 },
          functions: { total: 2, covered: 2, pct: 100 },
          branches: { total: 2, covered: 1, pct: 50 },
          statements: { total: 5, covered: 5, pct: 100 },
        },
      });

      mockReadFile.mockResolvedValueOnce(coverageData);

      const report = await adapter.parseCoverage('', projectPath);

      expect(mockReadFile).toHaveBeenCalledWith(path.join(projectPath, 'coverage', 'coverage-summary.json'));

      expect(report.overall.lines).toEqual({ total: 10, covered: 8, percentage: 80 });
      expect(report.overall.functions).toEqual({ total: 5, covered: 4, percentage: 80 });
      expect(report.overall.branches).toEqual({ total: 4, covered: 3, percentage: 75 });
      expect(report.overall.statements).toEqual({ total: 10, covered: 8, percentage: 80 });

      expect(report.files.length).toBe(1);
      const fileCov = report.files[0];
      expect(fileCov.path).toBe('src/file1.js');
      expect(fileCov.lines).toEqual({ total: 5, covered: 5, percentage: 100 });
      expect(fileCov.functions).toEqual({ total: 2, covered: 2, percentage: 100 });
      expect(fileCov.branches).toEqual({ total: 2, covered: 1, percentage: 50 });
      expect(fileCov.statements).toEqual({ total: 5, covered: 5, percentage: 100 });
      expect(fileCov.uncoveredLines).toEqual([]);

      expect(report.timestamp).toBe(fakeTimestamp.toISOString());
    });

    it('throws error if readFile or JSON parse fails', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('file not found'));
      await expect(adapter.parseCoverage('', '/bad/path')).rejects.toThrow('Failed to parse coverage: Error: file not found');
    });
  });

  describe('private convertCoverage', () => {
    it('converts data into CoverageSummary', () => {
      // @ts-ignore access private method
      const result = adapter.convertCoverage({ total: 10, covered: 5, pct: 50 });
      expect(result).toEqual({ total: 10, covered: 5, percentage: 50 });
    });

    it('defaults missing fields to zero', () => {
      // @ts-ignore
      expect(adapter.convertCoverage({})).toEqual({ total: 0, covered: 0, percentage: 0 });
      // @ts-ignore
      expect(adapter.convertCoverage(null)).toEqual({ total: 0, covered: 0, percentage: 0 });
    });
  });

  describe('private getPackageManager', () => {
    it('returns packageManager from project', () => {
      // @ts-ignore access private method
      expect(adapter.getPackageManager({ packageManager: 'yarn' })).toBe('yarn');
    });

    it('returns npm if packageManager not specified', () => {
      // @ts-ignore
      expect(adapter.getPackageManager({})).toBe('npm');
    });

    it('returns npm if project is undefined', () => {
      // @ts-ignore
      expect(adapter.getPackageManager(undefined)).toBe('npm');
    });
  });
});
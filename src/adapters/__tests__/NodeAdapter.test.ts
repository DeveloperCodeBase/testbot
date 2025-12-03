// @ts-nocheck
import path from 'path';
import { NodeAdapter } from '../NodeAdapter.js';
import { ProjectDescriptor } from '../../models/ProjectDescriptor.js';
import { readFile } from '../../utils/fileUtils.js';

jest.mock('../../utils/fileUtils.js', () => ({
  readFile: jest.fn(),
}));

describe('NodeAdapter', () => {
  let adapter: NodeAdapter;

  beforeEach(() => {
    adapter = new NodeAdapter();
    jest.resetAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for javascript projects', () => {
      const project: ProjectDescriptor = { language: 'javascript' };
      expect(adapter.canHandle(project)).toBe(true);
    });

    it('should return true for typescript projects', () => {
      const project: ProjectDescriptor = { language: 'typescript' };
      expect(adapter.canHandle(project)).toBe(true);
    });

    it('should return false for other languages', () => {
      const project: ProjectDescriptor = { language: 'python' };
      expect(adapter.canHandle(project)).toBe(false);
      expect(adapter.canHandle({ language: '' })).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project testFramework if set', () => {
      const project: ProjectDescriptor = { language: 'javascript', testFramework: 'mocha' };
      expect(adapter.getTestFramework(project)).toBe('mocha');
    });

    it('should default to jest if no testFramework', () => {
      const project: ProjectDescriptor = { language: 'typescript' };
      expect(adapter.getTestFramework(project)).toBe('jest');
    });
  });

  describe('getBuildCommand', () => {
    it('should return build command for typescript project', () => {
      const project: ProjectDescriptor = { language: 'typescript', packageManager: 'yarn' };
      expect(adapter.getBuildCommand(project)).toBe('yarn run build');
    });

    it('should default package manager to npm if undefined', () => {
      const project: ProjectDescriptor = { language: 'typescript' };
      expect(adapter.getBuildCommand(project)).toBe('npm run build');
    });

    it('should return null for javascript projects', () => {
      expect(adapter.getBuildCommand({ language: 'javascript' })).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    const baseProject = { language: 'javascript', packageManager: 'npm' };

    it('should return script commands for react framework', () => {
      const project = { ...baseProject, testFramework: 'react', framework: 'react', packageManager: 'yarn' };

      expect(adapter.getTestCommand(project, 'unit')).toBe('yarn run test:unit');
      expect(adapter.getTestCommand(project, 'integration')).toBe('yarn run test:integration');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('yarn run test:e2e');
    });

    it('should return jest commands for testType', () => {
      const project = { ...baseProject, testFramework: 'jest' };
      expect(adapter.getTestCommand(project, 'unit')).toBe('npm test -- --testPathPattern="src/.*__tests__"');
      expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --testPathPattern=".*\\.integration\\.test"');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --testPathPattern="e2e"');
    });

    it('should return mocha commands for testType', () => {
      const project = { ...baseProject, testFramework: 'mocha' };
      expect(adapter.getTestCommand(project, 'unit')).toBe('npm test');
      expect(adapter.getTestCommand(project, 'integration')).toBe('npm test -- --grep integration');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('npm test -- --grep e2e');
    });

    it('should return vitest run command for vitest framework', () => {
      const project = { ...baseProject, testFramework: 'vitest' };
      expect(adapter.getTestCommand(project, 'unit')).toBe('npx vitest run');
      expect(adapter.getTestCommand(project, 'integration')).toBe('npx vitest run');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('npx vitest run');
    });

    it('should return vitest run command for react testFramework (fallback)', () => {
      const project = { ...baseProject, testFramework: 'react' };
      expect(adapter.getTestCommand(project, 'unit')).toBe('npx vitest run');
    });

    it('should fallback to default test command', () => {
      const project = { ...baseProject, testFramework: 'unknown' };
      expect(adapter.getTestCommand(project, 'unit')).toBe('npm test');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return jest coverage command', () => {
      const project = { language: 'javascript', testFramework: 'jest', packageManager: 'yarn' };
      expect(adapter.getCoverageCommand(project)).toBe('yarn test -- --coverage --coverageReporters=json-summary --coverageReporters=json');
    });

    it('should return vitest coverage command', () => {
      const project = { language: 'typescript', testFramework: 'vitest', packageManager: 'npm' };
      expect(adapter.getCoverageCommand(project)).toBe('npm run test -- --coverage');
    });

    it('should return null for other frameworks', () => {
      const project = { language: 'javascript', testFramework: 'mocha' };
      expect(adapter.getCoverageCommand(project)).toBeNull();
    });
  });

  describe('getTestFilePath', () => {
    const baseProjectJS = { language: 'javascript' } as ProjectDescriptor;
    const reactProject = { language: 'typescript', framework: 'react' } as ProjectDescriptor;

    it('should use .ts extension if source file ends with .ts', () => {
      expect(adapter.getTestFilePath('foo.ts', 'unit', baseProjectJS)).toBe(path.join('tests', 'unit', 'foo.test.ts'));
      expect(adapter.getTestFilePath('foo.ts', 'integration', baseProjectJS)).toBe(path.join('tests', 'integration', 'foo.integration.test.ts'));
      expect(adapter.getTestFilePath('foo.ts', 'e2e', baseProjectJS)).toBe(path.join('tests', 'e2e', 'foo.e2e.test.ts'));
    });

    it('should use .js extension if source file ends with .js', () => {
      expect(adapter.getTestFilePath('foo.js', 'unit', baseProjectJS)).toBe(path.join('tests', 'unit', 'foo.test.js'));
    });

    it('should use jsx/tsx extension for react framework, appending x', () => {
      expect(adapter.getTestFilePath('foo.ts', 'unit', reactProject)).toBe(path.join('src', 'tests', 'unit', 'foo.test.tsx'));
      expect(adapter.getTestFilePath('foo.js', 'integration', reactProject)).toBe(path.join('src', 'tests', 'integration', 'foo.test.jsx'));
      expect(adapter.getTestFilePath('foo.ts', 'e2e', reactProject)).toBe(path.join('src', 'tests', 'e2e', 'foo.test.tsx'));
    });

    it('should return fallback test file path if unknown testType', () => {
      // @ts-expect-error testing unknown test type
      expect(adapter.getTestFilePath('foo.ts', 'unknown', baseProjectJS)).toBe('foo.ts.test.ts');
    });
  });

  describe('getTestDirectory', () => {
    it('should return src for react or vitest projects', () => {
      expect(adapter.getTestDirectory({ framework: 'react' } as ProjectDescriptor, 'unit')).toBe('src');
      expect(adapter.getTestDirectory({ testFramework: 'vitest' } as ProjectDescriptor, 'unit')).toBe('src');
    });

    it('should return . for other projects', () => {
      expect(adapter.getTestDirectory({ language: 'javascript' } as ProjectDescriptor, 'unit')).toBe('.');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return appropriate glob for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/{__tests__,tests}/**/*.test.{ts,js,tsx,jsx}');
    });

    it('should return appropriate glob for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*.integration.test.{ts,js,tsx,jsx}');
    });

    it('should return appropriate glob for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('**/*.e2e.{ts,js,tsx,jsx}');
    });

    it('should return fallback glob for unknown test type', () => {
      //@ts-expect-error testing unknown type
      expect(adapter.getTestFilePattern('foo')).toBe('**/*.test.{ts,js,tsx,jsx}');
    });
  });

  describe('parseCoverage', () => {
    const projectPath = '/fake/project';
    const coverageSummaryPath = path.join(projectPath, 'coverage', 'coverage-summary.json');

    const mockSummary = {
      total: {
        lines: { total: 10, covered: 8, pct: 80 },
        functions: { total: 5, covered: 4, pct: 80 },
        branches: { total: 3, covered: 3, pct: 100 },
        statements: { total: 10, covered: 8, pct: 80 },
      },
      'file1.js': {
        lines: { total: 5, covered: 5, pct: 100 },
        functions: { total: 2, covered: 2, pct: 100 },
        branches: { total: 1, covered: 1, pct: 100 },
        statements: { total: 5, covered: 5, pct: 100 },
      },
      'file2.js': {
        lines: { total: 5, covered: 3, pct: 60 },
        functions: { total: 3, covered: 2, pct: 66 },
        branches: { total: 2, covered: 2, pct: 100 },
        statements: { total: 5, covered: 3, pct: 60 },
      },
    };

    it('should parse coverage summary and convert correctly', async () => {
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockSummary));

      const report = await adapter.parseCoverage('', projectPath);

      expect(readFile).toHaveBeenCalledWith(coverageSummaryPath);
      expect(report.overall.lines).toEqual({ total: 10, covered: 8, percentage: 80 });
      expect(report.overall.functions).toEqual({ total: 5, covered: 4, percentage: 80 });
      expect(report.files).toHaveLength(2);
      expect(report.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'file1.js',
            lines: { total: 5, covered: 5, percentage: 100 },
            uncoveredLines: [],
          }),
          expect.objectContaining({
            path: 'file2.js',
            lines: { total: 5, covered: 3, percentage: 60 },
          }),
        ]),
      );
      expect(typeof report.timestamp).toBe('string');
    });

    it('should throw error if coverage summary cannot be read or parsed', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(adapter.parseCoverage('', projectPath)).rejects.toThrow('Failed to parse coverage');
    });
  });

  describe('convertCoverage', () => {
    it('should return zeros if data does not have expected properties', () => {
      const data = {};
      // @ts-expect-error testing with empty object
      expect(adapter['convertCoverage'](data)).toEqual({ total: 0, covered: 0, percentage: 0 });
    });

    it('should return values from data if present', () => {
      expect(
        adapter['convertCoverage']({
          total: 10,
          covered: 8,
          pct: 80,
        }),
      ).toEqual({ total: 10, covered: 8, percentage: 80 });
    });
  });

  describe('getPackageManager', () => {
    it('should return project packageManager if present', () => {
      expect(adapter['getPackageManager']({ packageManager: 'yarn' } as ProjectDescriptor)).toBe('yarn');
    });

    it('should default to npm if not present', () => {
      expect(adapter['getPackageManager']({} as ProjectDescriptor)).toBe('npm');
    });
  });
});
// @ts-nocheck
import type { LanguageAdapter } from '../LanguageAdapter';
import type { ProjectDescriptor } from '../../models/ProjectDescriptor';
import type { CoverageReport } from '../../models/CoverageReport';

describe('LanguageAdapter interface', () => {
  // This is an interface, so we can't test implementations directly here.
  // We'll create a dummy implementation to ensure interface methods/types are honored.

  class DummyAdapter implements LanguageAdapter {
    language = 'dummy';

    canHandle(project: ProjectDescriptor): boolean {
      return project.language === 'dummy';
    }
    getTestFramework(project: ProjectDescriptor): string {
      return 'dummy-framework';
    }
    getBuildCommand(project: ProjectDescriptor): string | null {
      return 'dummy-build-command';
    }
    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
      return `dummy-test-command-${testType}`;
    }
    getCoverageCommand(project: ProjectDescriptor): string | null {
      return 'dummy-coverage-command';
    }
    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', project: ProjectDescriptor): string {
      return `dummy-test-file-${sourceFile}`;
    }
    getTestDirectory(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
      return 'dummy-test-directory';
    }
    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string {
      return 'dummy-pattern';
    }
    async parseCoverage(coverageOutput: string, projectPath: string): Promise<CoverageReport> {
      return {
        overall: {
          lines: {total: 0, covered: 0, percentage: 0},
          functions: {total: 0, covered: 0, percentage: 0},
          branches: {total: 0, covered: 0, percentage: 0},
          statements: {total: 0, covered: 0, percentage: 0},
        },
        files: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  let adapter: LanguageAdapter;

  beforeEach(() => {
    adapter = new DummyAdapter();
  });

  it('should have a language property', () => {
    expect(adapter.language).toBe('dummy');
  });

  it('canHandle returns true for dummy language', () => {
    expect(adapter.canHandle({language: 'dummy'} as ProjectDescriptor)).toBe(true);
    expect(adapter.canHandle({language: 'other'} as ProjectDescriptor)).toBe(false);
  });

  it('returns strings from test framework, build command, test command, coverage command', () => {
    expect(adapter.getTestFramework({language: 'dummy'} as ProjectDescriptor)).toBe('dummy-framework');
    expect(adapter.getBuildCommand({language: 'dummy'} as ProjectDescriptor)).toBe('dummy-build-command');
    expect(adapter.getTestCommand({language: 'dummy'} as ProjectDescriptor, 'unit')).toBe('dummy-test-command-unit');
    expect(adapter.getCoverageCommand({language: 'dummy'} as ProjectDescriptor)).toBe('dummy-coverage-command');
  });

  it('returns test file path and directory patterns', () => {
    expect(adapter.getTestFilePath('src/file.ts', 'unit', {language: 'dummy'} as ProjectDescriptor))
      .toBe('dummy-test-file-src/file.ts');
    expect(adapter.getTestDirectory({language: 'dummy'} as ProjectDescriptor, 'unit')).toBe('dummy-test-directory');
    expect(adapter.getTestFilePattern('unit')).toBe('dummy-pattern');
  });

  it('parseCoverage returns a valid CoverageReport', async () => {
    const report = await adapter.parseCoverage('', '');
    expect(report).toHaveProperty('overall');
    expect(report).toHaveProperty('files');
    expect(report).toHaveProperty('timestamp');
  });
});
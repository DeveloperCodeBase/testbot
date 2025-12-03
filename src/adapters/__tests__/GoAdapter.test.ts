// @ts-nocheck
import path from 'path';
import { GoAdapter } from '../GoAdapter.js';

describe('GoAdapter', () => {
  let adapter: GoAdapter;
  const baseProject = { language: 'go' } as any;

  beforeEach(() => {
    adapter = new GoAdapter();
  });

  describe('canHandle', () => {
    it('should return true for "go" language', () => {
      expect(adapter.canHandle({ language: 'go' } as any)).toBe(true);
    });

    it('should return true for "golang" language', () => {
      expect(adapter.canHandle({ language: 'golang' } as any)).toBe(true);
    });

    it('should return false for others', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(false);
      expect(adapter.canHandle({} as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project testFramework if present', () => {
      expect(adapter.getTestFramework({ testFramework: 'testify' })).toBe('testify');
      expect(adapter.getTestFramework({ testFramework: 'custom' })).toBe('custom');
    });

    it('should default to "testing" if no testFramework specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('testing');
      expect(adapter.getTestFramework({ testFramework: undefined })).toBe('testing');
    });
  });

  describe('getBuildCommand', () => {
    it('should return null as Go test auto-compiles', () => {
      expect(adapter.getBuildCommand({} as any)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    it('should return correct test command for unit tests', () => {
      expect(adapter.getTestCommand({} as any, 'unit')).toBe('go test -short ./...');
    });

    it('should return correct test command for integration tests', () => {
      expect(adapter.getTestCommand({} as any, 'integration')).toBe('go test -tags=integration ./...');
    });

    it('should return correct test command for e2e tests', () => {
      expect(adapter.getTestCommand({} as any, 'e2e')).toBe('go test -tags=e2e ./tests/e2e/...');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return go coverage command string', () => {
      expect(adapter.getCoverageCommand({} as any)).toBe('go test -cover -coverprofile=coverage.out ./...');
    });
  });

  describe('getTestFilePath', () => {
    it('should return unit test filename co-located with source file', () => {
      const file = path.normalize('pkg/example.go');
      expect(adapter.getTestFilePath(file, 'unit', {} as any)).toBe(path.normalize('pkg/example_test.go'));
    });

    it('should return integration test filename co-located with source file', () => {
      const file = path.normalize('pkg/example.go');
      expect(adapter.getTestFilePath(file, 'integration', {} as any)).toBe(path.normalize('pkg/example_integration_test.go'));
    });

    it('should return e2e test filename in separate directory', () => {
      const file = path.normalize('pkg/example.go');
      expect(adapter.getTestFilePath(file, 'e2e', {} as any)).toBe(path.normalize('tests/e2e/example_e2e_test.go'));
    });
  });

  describe('getTestDirectory', () => {
    it('should return "." for unit and integration tests', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe('.');
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe('.');
    });

    it('should return "tests/e2e" for e2e tests', () => {
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe('tests/e2e');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return correct test file patterns', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*_test.go');
      expect(adapter.getTestFilePattern('integration')).toBe('**/*_integration_test.go');
      expect(adapter.getTestFilePattern('e2e')).toBe('tests/e2e/**/*_e2e_test.go');
    });
  });

  describe('parseCoverage', () => {
    it('should return empty CoverageReport structure', async () => {
      const report = await adapter.parseCoverage('', '');
      expect(report).toHaveProperty('overall');
      expect(report.overall.lines).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.overall.functions).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.overall.branches).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.files).toEqual([]);
      expect(new Date(report.timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
// @ts-nocheck
import path from 'path';
import { GoAdapter } from '../GoAdapter';
import { ProjectDescriptor } from '../../models/ProjectDescriptor';

describe('GoAdapter', () => {
  let adapter: GoAdapter;

  beforeEach(() => {
    adapter = new GoAdapter();
  });

  describe('language property', () => {
    it('should be "go"', () => {
      expect(adapter.language).toBe('go');
    });
  });

  describe('canHandle', () => {
    it('returns true for "go" language', () => {
      expect(adapter.canHandle({ name: 'project', language: 'go' } as ProjectDescriptor)).toBe(true);
    });

    it('returns true for "golang" language', () => {
      expect(adapter.canHandle({ name: 'project', language: 'golang' } as ProjectDescriptor)).toBe(true);
    });

    it('returns false for other languages', () => {
      expect(adapter.canHandle({ name: 'project', language: 'java' } as ProjectDescriptor)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('returns specified test framework', () => {
      expect(adapter.getTestFramework({ testFramework: 'testify' } as ProjectDescriptor)).toBe('testify');
    });

    it('returns "testing" if no testFramework specified', () => {
      expect(adapter.getTestFramework({} as ProjectDescriptor)).toBe('testing');
      expect(adapter.getTestFramework({ testFramework: undefined } as ProjectDescriptor)).toBe('testing');
    });
  });

  describe('getBuildCommand', () => {
    it('returns null as Go tests auto-compile', () => {
      expect(adapter.getBuildCommand({} as ProjectDescriptor)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    it('returns "go test -short ./..." for unit tests', () => {
      expect(adapter.getTestCommand({} as ProjectDescriptor, 'unit')).toBe('go test -short ./...');
    });

    it('returns "go test -tags=integration ./..." for integration tests', () => {
      expect(adapter.getTestCommand({} as ProjectDescriptor, 'integration')).toBe('go test -tags=integration ./...');
    });

    it('returns "go test -tags=e2e ./tests/e2e/..." for e2e tests', () => {
      expect(adapter.getTestCommand({} as ProjectDescriptor, 'e2e')).toBe('go test -tags=e2e ./tests/e2e/...');
    });
  });

  describe('getCoverageCommand', () => {
    it('returns go test coverage command', () => {
      expect(adapter.getCoverageCommand({} as ProjectDescriptor)).toBe(
        'go test -cover -coverprofile=coverage.out ./...',
      );
    });
  });

  describe('getTestFilePath', () => {
    it('returns co-located unit test file path with _test.go suffix', () => {
      const sourceFile = path.join('src', 'pkg', 'file.go');
      const expected = path.join('src', 'pkg', 'file_test.go');
      expect(adapter.getTestFilePath(sourceFile, 'unit', {} as ProjectDescriptor)).toBe(expected);
    });

    it('returns co-located integration test file path with _integration_test.go suffix', () => {
      const sourceFile = path.join('src', 'pkg', 'file.go');
      const expected = path.join('src', 'pkg', 'file_integration_test.go');
      expect(adapter.getTestFilePath(sourceFile, 'integration', {} as ProjectDescriptor)).toBe(expected);
    });

    it('returns e2e test file path under tests/e2e directory with _e2e_test.go suffix', () => {
      const sourceFile = path.join('src', 'pkg', 'file.go');
      const expected = path.join('tests', 'e2e', 'file_e2e_test.go');
      expect(adapter.getTestFilePath(sourceFile, 'e2e', {} as ProjectDescriptor)).toBe(expected);
    });
  });

  describe('getTestDirectory', () => {
    it('returns "." for unit tests', () => {
      expect(adapter.getTestDirectory({} as ProjectDescriptor, 'unit')).toBe('.');
    });

    it('returns "." for integration tests', () => {
      expect(adapter.getTestDirectory({} as ProjectDescriptor, 'integration')).toBe('.');
    });

    it('returns "tests/e2e" for e2e tests', () => {
      expect(adapter.getTestDirectory({} as ProjectDescriptor, 'e2e')).toBe('tests/e2e');
    });
  });

  describe('getTestFilePattern', () => {
    it('returns "**/*_test.go" for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*_test.go');
    });

    it('returns "**/*_integration_test.go" for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*_integration_test.go');
    });

    it('returns "tests/e2e/**/*_e2e_test.go" for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('tests/e2e/**/*_e2e_test.go');
    });
  });

  describe('parseCoverage', () => {
    it('returns empty coverage report with timestamp', async () => {
      const report = await adapter.parseCoverage('coverage data', '/path');
      expect(report).toHaveProperty('overall');
      expect(report.overall.lines.total).toBe(0);
      expect(Array.isArray(report.files)).toBe(true);
      expect(new Date(report.timestamp).getTime()).not.toBeNaN();
    });
  });
});
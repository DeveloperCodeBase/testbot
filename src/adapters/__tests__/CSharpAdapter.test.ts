// @ts-nocheck
import path from 'path';
import { CSharpAdapter } from '../CSharpAdapter.js';

describe('CSharpAdapter', () => {
  let adapter: CSharpAdapter;
  const baseProject = {
    language: 'csharp',
  } as any;

  beforeEach(() => {
    adapter = new CSharpAdapter();
  });

  describe('canHandle', () => {
    it('should return true for "csharp" language', () => {
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(true);
    });

    it('should return true for "c#" language', () => {
      expect(adapter.canHandle({ language: 'c#' } as any)).toBe(true);
    });

    it('should return false for other languages', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'go' } as any)).toBe(false);
      expect(adapter.canHandle({ language: '' } as any)).toBe(false);
    });

    it('should return false when language is undefined', () => {
      expect(adapter.canHandle({} as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project specified testFramework if set', () => {
      expect(adapter.getTestFramework({ testFramework: 'nunit' } as any)).toBe('nunit');
      expect(adapter.getTestFramework({ testFramework: 'mstest' } as any)).toBe('mstest');
    });

    it('should default to xunit if no testFramework specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('xunit');
      expect(adapter.getTestFramework({ testFramework: undefined } as any)).toBe('xunit');
    });
  });

  describe('getBuildCommand', () => {
    it('should always return "dotnet build"', () => {
      expect(adapter.getBuildCommand(baseProject)).toBe('dotnet build');
      expect(adapter.getBuildCommand({} as any)).toBe('dotnet build');
    });
  });

  describe('getTestCommand', () => {
    const frameworks = ['xunit', 'nunit', 'mstest', 'unknown'];

    test.each`
      framework   | testType      | expected
      ${'xunit'}  | ${'unit'}    | ${'dotnet test --filter "Category=Unit"'}
      ${'xunit'}  | ${'integration'} | ${'dotnet test --filter "Category=Integration"'}
      ${'xunit'}  | ${'e2e'}     | ${'dotnet test --filter "Category=E2E"'}
      ${'nunit'}  | ${'unit'}    | ${'dotnet test --filter "TestCategory=Unit"'}
      ${'nunit'}  | ${'integration'} | ${'dotnet test --filter "TestCategory=Integration"'}
      ${'nunit'}  | ${'e2e'}     | ${'dotnet test --filter "TestCategory=E2E"'}
      ${'mstest'} | ${'unit'}    | ${'dotnet test'}
      ${'mstest'} | ${'integration'} | ${'dotnet test'}
      ${'mstest'} | ${'e2e'}     | ${'dotnet test'}
      ${'unknown'}| ${'unit'}    | ${'dotnet test'}
    `(
      'returns expected command for framework=$framework and testType=$testType',
      ({ framework, testType, expected }) => {
        expect(adapter.getTestCommand({ testFramework: framework } as any, testType as any)).toBe(expected);
      }
    );

    it('defaults to xunit when no testFramework is specified', () => {
      expect(adapter.getTestCommand({} as any, 'unit')).toBe('dotnet test --filter "Category=Unit"');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return dotnet coverage command string', () => {
      expect(adapter.getCoverageCommand({} as any)).toBe(
        'dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura /p:CoverletOutput=./coverage.xml'
      );
    });
  });

  describe('getTestFilePath', () => {
    const projectDummy = {} as any;
    it('should generate correct unit test file path with src directory', () => {
      const sourceFile = path.normalize('src/Folder/Example.cs');
      const result = adapter.getTestFilePath(sourceFile, 'unit', projectDummy);
      expect(result.startsWith(path.join('tests', 'Unit'))).toBe(true);
      expect(result.endsWith('ExampleTests.cs')).toBe(true);
      expect(result).toMatch(/tests[\/\\]Unit[\/\\]Folder[\/\\]ExampleTests\.cs$/);
    });

    it('should generate correct integration test file path without src in path', () => {
      const sourceFile = path.normalize('Folder/Example.cs');
      const result = adapter.getTestFilePath(sourceFile, 'integration', projectDummy);
      expect(result.startsWith(path.join('tests', 'Integration'))).toBe(true);
      expect(result.endsWith('ExampleTests.cs')).toBe(true);
      expect(result).toBe(path.join('tests', 'Integration', 'ExampleTests.cs'));
    });

    it('should generate correct e2e test file path with src in path', () => {
      const sourceFile = path.normalize('src/Folder/Sub/Example.cs');
      const result = adapter.getTestFilePath(sourceFile, 'e2e', projectDummy);
      expect(result.startsWith(path.join('tests', 'E2E'))).toBe(true);
      expect(result.endsWith('ExampleTests.cs')).toBe(true);
      expect(result).toMatch(/tests[\/\\]E2E[\/\\]Folder[\/\\]Sub[\/\\]ExampleTests\.cs$/);
    });

    it('should handle file with multiple dots in name', () => {
      const sourceFile = path.normalize('src/Folder/File.name.cs');
      const result = adapter.getTestFilePath(sourceFile, 'unit', projectDummy);
      expect(result.endsWith('File.nameTests.cs')).toBe(true);
    });

    it('should work if sourceFile is just a file in root (no directory)', () => {
      const sourceFile = 'Example.cs';
      const result = adapter.getTestFilePath(sourceFile, 'unit', projectDummy);
      expect(result).toBe(path.join('tests', 'Unit', 'ExampleTests.cs'));
    });
  });

  describe('getTestDirectory', () => {
    it('should return correct test directories', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe('tests/Unit');
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe('tests/Integration');
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe('tests/E2E');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return correct glob patterns', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('tests/Unit/**/*Tests.cs');
      expect(adapter.getTestFilePattern('integration')).toBe('tests/Integration/**/*Tests.cs');
      expect(adapter.getTestFilePattern('e2e')).toBe('tests/E2E/**/*Tests.cs');
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
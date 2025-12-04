// @ts-nocheck
import path from 'path';
import { CSharpAdapter } from '../CSharpAdapter';

describe('CSharpAdapter', () => {
  let adapter: CSharpAdapter;

  beforeEach(() => {
    adapter = new CSharpAdapter();
  });

  describe('canHandle', () => {
    it('should return true for language "csharp"', () => {
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(true);
    });

    it('should return true for language "c#"', () => {
      expect(adapter.canHandle({ language: 'c#' } as any)).toBe(true);
    });

    it('should return false for other languages', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'go' } as any)).toBe(false);
      expect(adapter.canHandle({ language: '' } as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return specified test framework if present', () => {
      expect(adapter.getTestFramework({ testFramework: 'nunit' } as any)).toBe('nunit');
      expect(adapter.getTestFramework({ testFramework: 'mstest' } as any)).toBe('mstest');
    });

    it('should default to xunit if no testFramework specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('xunit');
      expect(adapter.getTestFramework({ testFramework: '' } as any)).toBe('');
    });
  });

  describe('getBuildCommand', () => {
    it('should always return "dotnet build"', () => {
      expect(adapter.getBuildCommand({} as any)).toBe('dotnet build');
    });
  });

  describe('getTestCommand', () => {
    const projectXunit = { testFramework: 'xunit' } as any;
    const projectNunit = { testFramework: 'nunit' } as any;
    const projectOther = {} as any;

    it('should return correct command for xunit unit tests', () => {
      expect(adapter.getTestCommand(projectXunit, 'unit')).toBe('dotnet test --filter "Category=Unit"');
    });

    it('should return correct command for xunit integration tests', () => {
      expect(adapter.getTestCommand(projectXunit, 'integration')).toBe('dotnet test --filter "Category=Integration"');
    });

    it('should return correct command for xunit e2e tests', () => {
      expect(adapter.getTestCommand(projectXunit, 'e2e')).toBe('dotnet test --filter "Category=E2E"');
    });

    it('should return correct command for nunit unit tests', () => {
      expect(adapter.getTestCommand(projectNunit, 'unit')).toBe('dotnet test --filter "TestCategory=Unit"');
    });

    it('should return correct command for nunit integration tests', () => {
      expect(adapter.getTestCommand(projectNunit, 'integration')).toBe('dotnet test --filter "TestCategory=Integration"');
    });

    it('should return correct command for nunit e2e tests', () => {
      expect(adapter.getTestCommand(projectNunit, 'e2e')).toBe('dotnet test --filter "TestCategory=E2E"');
    });

    it('should return default command for unsupported frameworks', () => {
      // When no framework specified, defaults to xunit, so it gets xunit filter
      expect(adapter.getTestCommand(projectOther, 'unit')).toBe('dotnet test --filter "Category=Unit"');
      // mstest is unsupported, so it returns plain dotnet test
      expect(adapter.getTestCommand({ testFramework: 'mstest' } as any, 'integration')).toBe('dotnet test');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return dotnet coverlet coverage command', () => {
      expect(adapter.getCoverageCommand({} as any)).toBe(
        'dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura /p:CoverletOutput=./coverage.xml'
      );
    });
  });

  describe('getTestFilePath', () => {
    it('should create correct test file path for unit test under src directory', () => {
      const result = adapter.getTestFilePath('src/Foo/Bar/Baz.cs', 'unit', {} as any);
      expect(result).toBe(path.join('tests', 'Unit', 'Foo', 'Bar', 'BazTests.cs'));
    });

    it('should create correct test file path for integration test under src directory', () => {
      const result = adapter.getTestFilePath('src/Foo/Bar/Baz.cs', 'integration', {} as any);
      expect(result).toBe(path.join('tests', 'Integration', 'Foo', 'Bar', 'BazTests.cs'));
    });

    it('should create correct test file path for e2e test under src directory', () => {
      const result = adapter.getTestFilePath('src/Foo/Bar/Baz.cs', 'e2e', {} as any);
      expect(result).toBe(path.join('tests', 'E2E', 'Foo', 'Bar', 'BazTests.cs'));
    });

    it('should create correct test file path when source not under src directory', () => {
      const result = adapter.getTestFilePath('lib/Baz.cs', 'unit', {} as any);
      expect(result).toBe(path.join('tests', 'Unit', 'BazTests.cs'));
    });

    it('should work with complex paths and backslashes', () => {
      const sourceFile = ['src', 'Foo', 'Bar', 'Baz.cs'].join(path.sep);
      const result = adapter.getTestFilePath(sourceFile, 'unit', {} as any);
      expect(result.startsWith(path.join('tests', 'Unit', 'Foo', 'Bar'))).toBe(true);
      expect(result.endsWith('BazTests.cs')).toBe(true);
    });
  });

  describe('getTestDirectory', () => {
    it('should return correct directory for unit tests', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe('tests/Unit');
    });

    it('should return correct directory for integration tests', () => {
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe('tests/Integration');
    });

    it('should return correct directory for e2e tests', () => {
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe('tests/E2E');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return correct pattern for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('tests/Unit/**/*Tests.cs');
    });

    it('should return correct pattern for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('tests/Integration/**/*Tests.cs');
    });

    it('should return correct pattern for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('tests/E2E/**/*Tests.cs');
    });
  });

  describe('parseCoverage', () => {
    it('should return empty coverage report with current timestamp', async () => {
      const coverage = await adapter.parseCoverage('', '/project/path');
      expect(coverage).toHaveProperty('overall');
      expect(coverage.overall.lines.percentage).toBe(0);
      expect(coverage.files).toEqual([]);
      expect(new Date(coverage.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});


// filename: src/adapters/__tests__/GoAdapter.test.ts
import path from 'path';
import { GoAdapter } from '../GoAdapter';

describe('GoAdapter', () => {
  let adapter: GoAdapter;

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

    it('should return false for other languages', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project.testFramework if specified', () => {
      expect(adapter.getTestFramework({ testFramework: 'testify' } as any)).toBe('testify');
    });

    it('should default to "testing" if no framework specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('testing');
    });
  });

  describe('getBuildCommand', () => {
    it('should return null as Go test auto-compiles', () => {
      expect(adapter.getBuildCommand({} as any)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    it('should return short test command for unit tests', () => {
      expect(adapter.getTestCommand({} as any, 'unit')).toBe('go test -short ./...');
    });

    it('should return integration test command with tag for integration tests', () => {
      expect(adapter.getTestCommand({} as any, 'integration')).toBe('go test -tags=integration ./...');
    });

    it('should return e2e test command for e2e tests', () => {
      expect(adapter.getTestCommand({} as any, 'e2e')).toBe('go test -tags=e2e ./tests/e2e/...');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return go test coverage command', () => {
      expect(adapter.getCoverageCommand({} as any)).toBe('go test -cover -coverprofile=coverage.out ./...');
    });
  });

  describe('getTestFilePath', () => {
    it('should create co-located unit test filename', () => {
      const source = path.join('pkg', 'foo.go');
      expect(adapter.getTestFilePath(source, 'unit', {} as any)).toBe(path.join('pkg', 'foo_test.go'));
    });

    it('should create co-located integration test filename with suffix', () => {
      const source = path.join('pkg', 'foo.go');
      expect(adapter.getTestFilePath(source, 'integration', {} as any)).toBe(path.join('pkg', 'foo_integration_test.go'));
    });

    it('should create e2e test file path in separate directory', () => {
      const source = path.join('pkg', 'foo.go');
      expect(adapter.getTestFilePath(source, 'e2e', {} as any)).toBe(path.join('tests', 'e2e', 'foo_e2e_test.go'));
    });
  });

  describe('getTestDirectory', () => {
    it('should return "." for unit tests', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe('.');
    });

    it('should return "." for integration tests', () => {
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe('.');
    });

    it('should return "tests/e2e" for e2e tests', () => {
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe('tests/e2e');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return pattern for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*_test.go');
    });

    it('should return pattern for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*_integration_test.go');
    });

    it('should return pattern for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('tests/e2e/**/*_e2e_test.go');
    });
  });

  describe('parseCoverage', () => {
    it('should return empty coverage report with current timestamp', async () => {
      const coverage = await adapter.parseCoverage('', '/some/project');
      expect(coverage).toHaveProperty('overall');
      expect(coverage.overall.lines.percentage).toBe(0);
      expect(coverage.files).toEqual([]);
      expect(new Date(coverage.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});


// filename: src/adapters/__tests__/JavaAdapter.test.ts
import path from 'path';
import { JavaAdapter } from '../JavaAdapter';

describe('JavaAdapter', () => {
  let adapter: JavaAdapter;

  beforeEach(() => {
    adapter = new JavaAdapter();
  });

  describe('canHandle', () => {
    it('should return true for language "java"', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(true);
    });

    it('should return false for other languages', () => {
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'go' } as any)).toBe(false);
      expect(adapter.canHandle({ language: '' } as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return specified test framework if present', () => {
      expect(adapter.getTestFramework({ testFramework: 'testng' } as any)).toBe('testng');
    });

    it('should default to "junit" if none specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('junit');
    });
  });

  describe('getBuildCommand', () => {
    it('should return mvn command if buildTool is maven', () => {
      expect(adapter.getBuildCommand({ buildTool: 'maven' } as any)).toBe('mvn clean compile');
    });

    it('should return gradle command if buildTool is gradle', () => {
      expect(adapter.getBuildCommand({ buildTool: 'gradle' } as any)).toBe('./gradlew build -x test');
    });

    it('should return null if buildTool is unknown or missing', () => {
      expect(adapter.getBuildCommand({ buildTool: 'bazel' } as any)).toBeNull();
      expect(adapter.getBuildCommand({} as any)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    it('should return Maven unit test command by default', () => {
      expect(adapter.getTestCommand({ buildTool: 'maven' } as any, 'unit')).toBe('mvn test');
    });

    it('should return Maven integration test command', () => {
      expect(adapter.getTestCommand({ buildTool: 'maven' } as any, 'integration')).toBe('mvn integration-test');
    });

    it('should return Maven e2e test command', () => {
      expect(adapter.getTestCommand({ buildTool: 'maven' } as any, 'e2e')).toBe('mvn verify');
    });

    it('should return Gradle unit test command', () => {
      expect(adapter.getTestCommand({ buildTool: 'gradle' } as any, 'unit')).toBe('./gradlew test');
    });

    it('should return Gradle integration test command', () => {
      expect(adapter.getTestCommand({ buildTool: 'gradle' } as any, 'integration')).toBe('./gradlew integrationTest');
    });

    it('should return Gradle e2e test command', () => {
      expect(adapter.getTestCommand({ buildTool: 'gradle' } as any, 'e2e')).toBe('./gradlew e2eTest');
    });

    it('should default to maven test if buildTool unknown', () => {
      expect(adapter.getTestCommand({ buildTool: 'bazel' } as any, 'unit')).toBe('mvn test');
    });

    it('should default to maven test if buildTool missing', () => {
      expect(adapter.getTestCommand({} as any, 'unit')).toBe('mvn test');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return Maven coverage command', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'maven' } as any)).toBe('mvn test jacoco:report');
    });

    it('should return Gradle coverage command', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'gradle' } as any)).toBe('./gradlew test jacocoTestReport');
    });

    it('should return null for unknown or missing buildTool', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'bazel' } as any)).toBeNull();
      expect(adapter.getCoverageCommand({} as any)).toBeNull();
    });
  });

  describe('getTestFilePath', () => {
    const sourceFile = path.join('src', 'main', 'java', 'com', 'example', 'Foo.java');

    it('should return correct unit test file path', () => {
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java');
      expect(adapter.getTestFilePath(sourceFile, 'unit', {} as any)).toBe(expected);
    });

    it('should return correct integration test file path', () => {
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooIT.java');
      expect(adapter.getTestFilePath(sourceFile, 'integration', {} as any)).toBe(expected);
    });

    it('should return correct e2e test file path', () => {
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooE2ETest.java');
      expect(adapter.getTestFilePath(sourceFile, 'e2e', {} as any)).toBe(expected);
    });

    it('should fallback to unit test naming for unknown test type', () => {
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java');
      expect(adapter.getTestFilePath(sourceFile, 'fake' as any, {} as any)).toBe(expected);
    });

    it('should replace only first occurrence of /main/ with /test/', () => {
      const complexPath = path.join('project', 'main', 'main', 'java', 'com', 'example', 'Foo.java');
      const expectedBase = complexPath.replace('/main/', '/test/');
      const expected = path.join(path.dirname(expectedBase), 'FooTest.java');
      expect(adapter.getTestFilePath(complexPath, 'unit', {} as any)).toBe(expected);
    });
  });

  describe('getTestDirectory', () => {
    it('should always return src/test/java as test directory', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe(path.join('src', 'test', 'java'));
    });
  });

  describe('getTestFilePattern', () => {
    it('should return pattern for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*Test.java');
    });

    it('should return pattern for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*IT.java');
    });

    it('should return pattern for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('**/*E2E.java');
    });

    it('should fallback to unit pattern for unknown test type', () => {
      expect(adapter.getTestFilePattern('fake' as any)).toBe('**/*Test.java');
    });
  });

  describe('parseCoverage', () => {
    it('should return empty coverage report with current timestamp', async () => {
      const coverage = await adapter.parseCoverage('', '/another/project');
      expect(coverage).toHaveProperty('overall');
      expect(coverage.overall.lines.percentage).toBe(0);
      expect(coverage.files).toEqual([]);
      expect(new Date(coverage.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
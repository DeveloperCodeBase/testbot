// @ts-nocheck
import path from 'path';
import { JavaAdapter } from '../JavaAdapter.js';

describe('JavaAdapter', () => {
  let adapter: JavaAdapter;
  const baseProject = { language: 'java' } as any;

  beforeEach(() => {
    adapter = new JavaAdapter();
  });

  describe('canHandle', () => {
    it('should return true for "java" language', () => {
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(true);
    });

    it('should return false for other languages', () => {
      expect(adapter.canHandle({ language: 'go' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'csharp' } as any)).toBe(false);
      expect(adapter.canHandle({} as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project testFramework if specified', () => {
      expect(adapter.getTestFramework({ testFramework: 'testng' } as any)).toBe('testng');
    });

    it('should default to junit if no testFramework specified', () => {
      expect(adapter.getTestFramework({} as any)).toBe('junit');
      expect(adapter.getTestFramework({ testFramework: undefined } as any)).toBe('junit');
    });
  });

  describe('getBuildCommand', () => {
    it('should return mvn command for maven buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'maven' } as any)).toBe('mvn clean compile');
    });

    it('should return gradle command for gradle buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'gradle' } as any)).toBe('./gradlew build -x test');
    });

    it('should return null for unknown or missing buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'ant' } as any)).toBeNull();
      expect(adapter.getBuildCommand({} as any)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    const mavenTests = [
      { testType: 'unit', expected: 'mvn test' },
      { testType: 'integration', expected: 'mvn integration-test' },
      { testType: 'e2e', expected: 'mvn verify' },
    ];

    const gradleTests = [
      { testType: 'unit', expected: './gradlew test' },
      { testType: 'integration', expected: './gradlew integrationTest' },
      { testType: 'e2e', expected: './gradlew e2eTest' },
    ];

    it('should return correct maven test commands', () => {
      mavenTests.forEach(({ testType, expected }) => {
        expect(adapter.getTestCommand({ buildTool: 'maven' } as any, testType as any)).toBe(expected);
      });
    });

    it('should return correct gradle test commands', () => {
      gradleTests.forEach(({ testType, expected }) => {
        expect(adapter.getTestCommand({ buildTool: 'gradle' } as any, testType as any)).toBe(expected);
      });
    });

    it('should default to maven commands when no buildTool is specified', () => {
      mavenTests.forEach(({ testType, expected }) => {
        expect(adapter.getTestCommand({} as any, testType as any)).toBe(expected);
      });
    });

    it('should default to mvn test if buildTool is unknown', () => {
      expect(adapter.getTestCommand({ buildTool: 'ant' } as any, 'unit')).toBe('mvn test');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return maven jacoco command', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'maven' } as any)).toBe('mvn test jacoco:report');
    });

    it('should return gradle jacoco command', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'gradle' } as any)).toBe('./gradlew test jacocoTestReport');
    });

    it('should return null for unknown or missing buildTool', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'ant' } as any)).toBeNull();
      expect(adapter.getCoverageCommand({} as any)).toBeNull();
    });
  });

  describe('getTestFilePath', () => {
    it('should replace /main/ with /test/ in sourceFile path', () => {
      const sourceFile = path.normalize('src/main/java/com/example/Foo.java');
      const result = adapter.getTestFilePath(sourceFile, 'unit', {} as any);
      expect(result.startsWith(path.normalize('src/test/java/com/example'))).toBe(true);
    });

    it('should append "Test.java" suffix for unit tests', () => {
      const sourceFile = path.normalize('src/main/java/com/example/Foo.java');
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java');
      expect(adapter.getTestFilePath(sourceFile, 'unit', {} as any)).toBe(expected);
    });

    it('should append "IT.java" suffix for integration tests', () => {
      const sourceFile = path.normalize('src/main/java/com/example/Foo.java');
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooIT.java');
      expect(adapter.getTestFilePath(sourceFile, 'integration', {} as any)).toBe(expected);
    });

    it('should append "E2ETest.java" suffix for E2E tests', () => {
      const sourceFile = path.normalize('src/main/java/com/example/Foo.java');
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooE2ETest.java');
      expect(adapter.getTestFilePath(sourceFile, 'e2e', {} as any)).toBe(expected);
    });

    it('should default to unit test suffix when unknown testType provided', () => {
      const sourceFile = path.normalize('src/main/java/com/example/Foo.java');
      const expected = path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java');
      expect(adapter.getTestFilePath(sourceFile, 'unknown' as any, {} as any)).toBe(expected);
    });

    it('should handle source file without /main/ in path by replacing nothing', () => {
      const sourceFile = path.normalize('src/something/Foo.java');
      const result = adapter.getTestFilePath(sourceFile, 'unit', {} as any);
      expect(result).toContain('src/something');
      expect(result.endsWith('FooTest.java')).toBe(true);
    });
  });

  describe('getTestDirectory', () => {
    it('should always return "src/test/java"', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe(path.join('src', 'test', 'java'));
    });
  });

  describe('getTestFilePattern', () => {
    it('should return patterns matching test types', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*Test.java');
      expect(adapter.getTestFilePattern('integration')).toBe('**/*IT.java');
      expect(adapter.getTestFilePattern('e2e')).toBe('**/*E2E.java');
    });

    it('should default to unit pattern for unknown testType', () => {
      expect(adapter.getTestFilePattern('unknown' as any)).toBe('**/*Test.java');
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
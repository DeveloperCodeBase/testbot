// @ts-nocheck
import path from 'path';
import { JavaAdapter } from '../JavaAdapter';
import { ProjectDescriptor } from '../../models/ProjectDescriptor';

describe('JavaAdapter', () => {
  let adapter: JavaAdapter;

  beforeEach(() => {
    adapter = new JavaAdapter();
  });

  describe('language property', () => {
    it('should have language set to "java"', () => {
      expect(adapter.language).toBe('java');
    });
  });

  describe('canHandle', () => {
    it('returns true for project language java', () => {
      const project: ProjectDescriptor = { language: 'java' } as any;
      expect(adapter.canHandle(project)).toBe(true);
    });

    it('returns false for other languages', () => {
      const project: ProjectDescriptor = { language: 'javascript' } as any;
      expect(adapter.canHandle(project)).toBe(false);
    });

    it('returns false if project.language is undefined', () => {
      const project = {} as ProjectDescriptor;
      expect(adapter.canHandle(project)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('returns the project testFramework if set', () => {
      expect(adapter.getTestFramework({ language: 'java', testFramework: 'custom' } as any)).toBe('custom');
    });

    it('returns junit as default when testFramework is not provided', () => {
      expect(adapter.getTestFramework({ language: 'java' } as any)).toBe('junit');
    });
  });

  describe('getBuildCommand', () => {
    it('returns maven build command for maven buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'maven', language: 'java' } as any)).toBe('mvn clean compile');
    });

    it('returns gradle build command for gradle buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'gradle', language: 'java' } as any)).toBe('./gradlew build -x test');
    });

    it('returns null for unsupported buildTool', () => {
      expect(adapter.getBuildCommand({ buildTool: 'ant', language: 'java' } as any)).toBeNull();
    });

    it('returns null if buildTool not specified', () => {
      expect(adapter.getBuildCommand({ language: 'java' } as any)).toBeNull();
    });
  });

  describe('getTestCommand', () => {
    const testTypes: ('unit' | 'integration' | 'e2e')[] = ['unit', 'integration', 'e2e'];

    describe('maven buildTool', () => {
      const mavenProject = { buildTool: 'maven' } as ProjectDescriptor;

      it('returns correct maven test commands', () => {
        expect(adapter.getTestCommand(mavenProject, 'unit')).toBe('mvn test');
        expect(adapter.getTestCommand(mavenProject, 'integration')).toBe('mvn integration-test');
        expect(adapter.getTestCommand(mavenProject, 'e2e')).toBe('mvn verify');
      });
    });

    describe('gradle buildTool', () => {
      const gradleProject = { buildTool: 'gradle' } as ProjectDescriptor;

      it('returns correct gradle test commands', () => {
        expect(adapter.getTestCommand(gradleProject, 'unit')).toBe('./gradlew test');
        expect(adapter.getTestCommand(gradleProject, 'integration')).toBe('./gradlew integrationTest');
        expect(adapter.getTestCommand(gradleProject, 'e2e')).toBe('./gradlew e2eTest');
      });
    });

    describe('default buildTool (maven)', () => {
      it('returns maven unit test command by default', () => {
        const noBuildToolProject = {} as ProjectDescriptor;
        expect(adapter.getTestCommand(noBuildToolProject, 'unit')).toBe('mvn test');
      });
    });

    it('returns default maven test command for unknown buildTool', () => {
      const unknownBuildToolProject = { buildTool: 'ant' } as ProjectDescriptor;
      expect(adapter.getTestCommand(unknownBuildToolProject, 'unit')).toBe('mvn test');
    });
  });

  describe('getCoverageCommand', () => {
    it('returns maven coverage command for maven buildTool', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'maven' } as any)).toBe('mvn test jacoco:report');
    });

    it('returns gradle coverage command for gradle buildTool', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'gradle' } as any)).toBe('./gradlew test jacocoTestReport');
    });

    it('returns null for unsupported buildTool', () => {
      expect(adapter.getCoverageCommand({ buildTool: 'ant' } as any)).toBeNull();
    });

    it('returns maven coverage command by default if no buildTool', () => {
      expect(adapter.getCoverageCommand({} as any)).toBe('mvn test jacoco:report');
    });
  });

  describe('getTestFilePath', () => {
    const sourceFile = 'src/main/java/com/example/Foo.java';
    const project = {} as ProjectDescriptor;

    it('replaces /main/ by /test/ and appends proper suffix for unit tests', () => {
      const result = adapter.getTestFilePath(sourceFile, 'unit', project);
      expect(result).toBe(path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java'));
    });

    it('appends IT suffix for integration tests', () => {
      const result = adapter.getTestFilePath(sourceFile, 'integration', project);
      expect(result).toBe(path.join('src', 'test', 'java', 'com', 'example', 'FooIT.java'));
    });

    it('appends E2ETest suffix for e2e tests', () => {
      const result = adapter.getTestFilePath(sourceFile, 'e2e', project);
      expect(result).toBe(path.join('src', 'test', 'java', 'com', 'example', 'FooE2ETest.java'));
    });

    it('defaults to unit test suffix for unknown test types', () => {
      // @ts-expect-error passing invalid testType to check fallback
      const result = adapter.getTestFilePath(sourceFile, 'unknown', project);
      expect(result).toBe(path.join('src', 'test', 'java', 'com', 'example', 'FooTest.java'));
    });

    it('handles source files not containing /main/ gracefully', () => {
      const weirdSource = 'src/other/java/com/example/Foo.java';
      const res = adapter.getTestFilePath(weirdSource, 'unit', project);
      expect(res).toBe(path.join('src', 'other', 'java', 'com', 'example', 'FooTest.java'));
    });
  });

  describe('getTestDirectory', () => {
    it('returns src/test/java as test directory', () => {
      const project = {} as ProjectDescriptor;
      expect(adapter.getTestDirectory(project, 'unit')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory(project, 'integration')).toBe(path.join('src', 'test', 'java'));
      expect(adapter.getTestDirectory(project, 'e2e')).toBe(path.join('src', 'test', 'java'));
    });
  });

  describe('getTestFilePattern', () => {
    it('returns correct pattern for unit tests', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/*Test.java');
    });

    it('returns correct pattern for integration tests', () => {
      expect(adapter.getTestFilePattern('integration')).toBe('**/*IT.java');
    });

    it('returns correct pattern for e2e tests', () => {
      expect(adapter.getTestFilePattern('e2e')).toBe('**/*E2E.java');
    });

    it('returns unit test pattern for unknown testTypes', () => {
      // @ts-expect-error invalid type
      expect(adapter.getTestFilePattern('unknown')).toBe('**/*Test.java');
    });
  });

  describe('parseCoverage', () => {
    it('returns a CoverageReport with zeros and timestamp', async () => {
      const output = '<xml>dummy coverage output</xml>';
      const report = await adapter.parseCoverage(output, '/fake/path');

      expect(report).toHaveProperty('overall');
      expect(report.overall.lines).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.overall.functions).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.overall.branches).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(report.files).toEqual([]);
      expect(new Date(report.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
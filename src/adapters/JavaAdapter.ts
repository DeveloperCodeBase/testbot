import path from 'path';
import { LanguageAdapter } from './LanguageAdapter.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { CoverageReport } from '../models/CoverageReport.js';

/**
 * Language adapter for Java projects
 */
export class JavaAdapter implements LanguageAdapter {
    language = 'java';

    canHandle(project: ProjectDescriptor): boolean {
        return project.language === 'java';
    }

    getTestFramework(project: ProjectDescriptor): string {
        return project.testFramework || 'junit';
    }

    getBuildCommand(project: ProjectDescriptor): string | null {
        if (project.buildTool === 'maven') {
            return 'mvn clean compile';
        } else if (project.buildTool === 'gradle') {
            return './gradlew build -x test';
        }
        return null;
    }

    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        const buildTool = project.buildTool || 'maven';

        if (buildTool === 'maven') {
            if (testType === 'unit') {
                return 'mvn test';
            } else if (testType === 'integration') {
                return 'mvn integration-test';
            } else if (testType === 'e2e') {
                return 'mvn verify';
            }
        } else if (buildTool === 'gradle') {
            if (testType === 'unit') {
                return './gradlew test';
            } else if (testType === 'integration') {
                return './gradlew integrationTest';
            } else if (testType === 'e2e') {
                return './gradlew e2eTest';
            }
        }

        return 'mvn test';
    }

    getCoverageCommand(project: ProjectDescriptor): string | null {
        const buildTool = project.buildTool || 'maven';

        if (buildTool === 'maven') {
            return 'mvn test jacoco:report';
        } else if (buildTool === 'gradle') {
            return './gradlew test jacocoTestReport';
        }

        return null;
    }

    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor): string {
        // Convert src/main/java/com/example/Foo.java to src/test/java/com/example/FooTest.java
        const testPath = sourceFile.replace('/main/', '/test/');
        const baseName = path.basename(testPath, '.java');
        const dir = path.dirname(testPath);

        if (testType === 'unit') {
            return path.join(dir, `${baseName}Test.java`);
        } else if (testType === 'integration') {
            return path.join(dir, `${baseName}IT.java`);
        } else if (testType === 'e2e') {
            return path.join(dir, `${baseName}E2ETest.java`);
        }

        return path.join(dir, `${baseName}Test.java`);
    }

    getTestDirectory(_project: ProjectDescriptor, _testType: 'unit' | 'integration' | 'e2e'): string {
        // Java tests are typically in src/test/java
        // We return the root test directory as specific types are mixed or separated by package
        // But for checking existence, we can check src/test/java
        return path.join('src', 'test', 'java');
    }

    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string {
        if (testType === 'unit') return '**/*Test.java';
        if (testType === 'integration') return '**/*IT.java';
        if (testType === 'e2e') return '**/*E2E.java';
        return '**/*Test.java';
    }

    async parseCoverage(_coverageOutput: string, _projectPath: string): Promise<CoverageReport> {
        // JaCoCo parsing would require XML parsing
        // For now, return a placeholder
        return {
            overall: {
                lines: { total: 0, covered: 0, percentage: 0 },
                functions: { total: 0, covered: 0, percentage: 0 },
                branches: { total: 0, covered: 0, percentage: 0 },
            },
            files: [],
            timestamp: new Date().toISOString(),
        };
    }
}

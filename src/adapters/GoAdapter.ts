import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { LanguageAdapter } from './LanguageAdapter';
import { CoverageReport } from '../models/CoverageReport';
import path from 'path';

/**
 * Adapter for Go projects
 * Supports built-in testing package and testify
 */
export class GoAdapter implements LanguageAdapter {
    language = 'go';

    canHandle(project: ProjectDescriptor): boolean {
        return project.language === 'go' || project.language === 'golang';
    }

    getTestFramework(project: ProjectDescriptor): string {
        // Go has built-in testing, but testify is popular
        return project.testFramework || 'testing';
    }

    getBuildCommand(_project: ProjectDescriptor): string | null {
        // Go test automatically compiles
        return null;
    }

    getTestCommand(_project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        // Go testing supports build tags and -run flag for filtering
        if (testType === 'unit') {
            // Run only short tests (convention: exclude integration tests)
            return 'go test -short ./...';
        } else if (testType === 'integration') {
            // Run tests with integration build tag
            return 'go test -tags=integration ./...';
        } else {
            // E2E tests often in separate directory
            return 'go test -tags=e2e ./tests/e2e/...';
        }
    }

    getCoverageCommand(_project: ProjectDescriptor): string | null {
        // Go built-in coverage
        return 'go test -cover -coverprofile=coverage.out ./...';
    }

    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor): string {
        // Go convention: file.go => file_test.go (co-located)
        const baseName = path.basename(sourceFile, '.go');
        const dirName = path.dirname(sourceFile);

        if (testType === 'unit') {
            // Unit tests co-located with source
            return path.join(dirName, `${baseName}_test.go`);
        } else if (testType === 'integration') {
            // Integration tests can be co-located or in tests/
            return path.join(dirName, `${baseName}_integration_test.go`);
        } else {
            // E2E tests in separate directory
            return path.join('tests', 'e2e', `${baseName}_e2e_test.go`);
        }
    }

    getTestDirectory(_project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        // Go tests are typically co-located with source
        if (testType === 'e2e') {
            return 'tests/e2e';
        }
        // Unit and integration tests are co-located
        return '.';
    }

    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string {
        if (testType === 'unit') {
            return '**/*_test.go';
        } else if (testType === 'integration') {
            return '**/*_integration_test.go';
        } else {
            return 'tests/e2e/**/*_e2e_test.go';
        }
    }

    async parseCoverage(_coverageOutput: string, _projectPath: string): Promise<CoverageReport> {
        // Parse go coverage output
        // For now, return empty report
        return {
            overall: {
                lines: { total: 0, covered: 0, percentage: 0 },
                functions: { total: 0, covered: 0, percentage: 0 },
                branches: { total: 0, covered: 0, percentage: 0 }
            },
            files: [],
            timestamp: new Date().toISOString()
        };
    }
}

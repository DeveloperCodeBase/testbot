import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { LanguageAdapter } from './LanguageAdapter.js';
import { CoverageReport } from '../models/CoverageReport.js';
import path from 'path';

/**
 * Adapter for C# (.NET) projects
 * Supports xUnit, NUnit, and MSTest frameworks
 */
export class CSharpAdapter implements LanguageAdapter {
    language = 'csharp';

    canHandle(project: ProjectDescriptor): boolean {
        return project.language === 'csharp' || project.language === 'c#';
    }

    getTestFramework(project: ProjectDescriptor): string {
        // Check if specific framework is specified
        if (project.testFramework) {
            return project.testFramework;
        }

        // Default to xUnit (modern .NET standard)
        return 'xunit';
    }

    getBuildCommand(_project: ProjectDescriptor): string | null {
        // .NET projects need to be built before testing
        return 'dotnet build';
    }

    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        // For .NET, we can filter tests by category/trait
        const framework = this.getTestFramework(project);

        if (framework === 'xunit') {
            // xUnit uses traits for categorization
            if (testType === 'unit') {
                return 'dotnet test --filter "Category=Unit"';
            } else if (testType === 'integration') {
                return 'dotnet test --filter "Category=Integration"';
            } else {
                return 'dotnet test --filter "Category=E2E"';
            }
        } else if (framework === 'nunit') {
            // NUnit uses categories
            if (testType === 'unit') {
                return 'dotnet test --filter "TestCategory=Unit"';
            } else if (testType === 'integration') {
                return 'dotnet test --filter "TestCategory=Integration"';
            } else {
                return 'dotnet test --filter "TestCategory=E2E"';
            }
        }

        // Default: run all tests
        return 'dotnet test';
    }

    getCoverageCommand(_project: ProjectDescriptor): string | null {
        // Use coverlet for code coverage
        return 'dotnet test --collect:"XPlat Code Coverage"';
    }

    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor): string {
        // C# convention: SourceFile.cs => SourceFileTests.cs
        const baseName = path.basename(sourceFile, path.extname(sourceFile));
        const dirName = path.dirname(sourceFile);

        // Determine test directory based on type
        let testDir: string;
        if (testType === 'unit') {
            testDir = 'tests/Unit';
        } else if (testType === 'integration') {
            testDir = 'tests/Integration';
        } else {
            testDir = 'tests/E2E';
        }

        // Test file naming: {ClassName}Tests.cs
        const testFileName = `${baseName}Tests.cs`;

        // If source is in src/, mirror structure in tests/
        if (dirName.includes('src')) {
            const relativePath = dirName.replace(/.*src[\/\\]/, '');
            return path.join(testDir, relativePath, testFileName);
        }

        return path.join(testDir, testFileName);
    }

    getTestDirectory(_project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        // .NET conventional structure
        if (testType === 'unit') {
            return 'tests/Unit';
        } else if (testType === 'integration') {
            return 'tests/Integration';
        } else {
            return 'tests/E2E';
        }
    }

    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string {
        // C# test files end with Tests.cs
        if (testType === 'unit') {
            return 'tests/Unit/**/*Tests.cs';
        } else if (testType === 'integration') {
            return 'tests/Integration/**/*Tests.cs';
        } else {
            return 'tests/E2E/**/*Tests.cs';
        }
    }

    async parseCoverage(_coverageOutput: string, _projectPath: string): Promise<CoverageReport> {
        // Parse coverlet XML output
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

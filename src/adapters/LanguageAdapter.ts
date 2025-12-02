import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { CoverageReport } from '../models/CoverageReport.js';

/**
 * Base interface for language adapters
 */
export interface LanguageAdapter {
    /**
     * Language name
     */
    language: string;

    /**
     * Detect if this adapter can handle the project
     */
    canHandle(project: ProjectDescriptor): boolean;

    /**
     * Get the default test framework
     */
    getTestFramework(project: ProjectDescriptor): string;

    /**
     * Get the build command (if needed)
     */
    getBuildCommand(project: ProjectDescriptor): string | null;

    /**
     * Get the test command for a specific test type
     */
    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string;

    /**
     * Get the coverage command
     */
    getCoverageCommand(project: ProjectDescriptor): string | null;

    /**
     * Get the file path for a test file given a source file
     */
    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', project: ProjectDescriptor): string;

    /**
     * Get the directory where test files for a specific type are located.
     */
    getTestDirectory(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string;

    /**
     * Get the glob pattern for test files
     */
    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string;

    /**
     * Parse coverage output into a normalized format
     */
    parseCoverage(coverageOutput: string, projectPath: string): Promise<CoverageReport>;
}

import { EnvironmentIssue, AutoFixAction } from './EnvironmentModels.js';

/**
 * Result of a single test suite execution
 */
export interface TestSuiteResult {
    type: 'unit' | 'integration' | 'e2e';
    command: string;
    status: 'passed' | 'failed' | 'skipped';
    exitCode: number;
    logsPath: string;
    coveragePath?: string;
    duration: number;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    stdout?: string;
    stderr?: string;
    errors?: string[];
}

/**
 * Result of all test executions for a project
 */
export interface TestRunResult {
    project: string;
    projectPath: string;
    language: string;
    framework?: string;
    generatedTestFiles: string[];
    testSuites: TestSuiteResult[];
    overallStatus: 'passed' | 'failed' | 'partial';
    totalDuration: number;
    timestamp: string;
    environmentIssues: EnvironmentIssue[];
    autoFixActions: AutoFixAction[];
}

/**
 * Final job result
 */
export interface JobResult {
    jobId: string;
    repoPath: string;
    repoUrl?: string;
    status: 'success' | 'failed' | 'partial';
    startTime: string;
    endTime: string;
    duration: number;
    projectResults: TestRunResult[];
    generatedTestFiles: string[];
    errors: string[];
    environmentIssues: EnvironmentIssue[];
    autoFixActions: AutoFixAction[];
    summary: {
        totalProjects: number;
        totalTests: number;
        passedTests: number;
        failedTests: number;
        failedSuites?: number;              // Number of test suites that failed
        suitesWithDiscoveryErrors?: number; // Number of suites skipped due to NO_TESTS_FOUND
        reason?: string;                    // Explanation when totalTests is 0
        overallCoverage?: number;
    };
}

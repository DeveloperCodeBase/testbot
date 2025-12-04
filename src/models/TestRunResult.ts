import { EnvironmentIssue, AutoFixAction } from './EnvironmentModels';
import { CoverageReport } from './CoverageModels';

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
    coverage?: CoverageReport;
}

/**
 * Represents a structured issue in the job execution
 */
export interface JobIssue {
    project: string;
    stage: 'env_heal' | 'generate' | 'execute' | 'coverage' | 'refine' | 'llm';
    kind: string;  // e.g. 'JEST_MISSING_PACKAGE', 'TEST_TS_ERROR', 'COVERAGE_BELOW_THRESHOLD', 'LLM_CALL_FAILED'
    severity: 'info' | 'warning' | 'error';
    message: string;
    suggestion: string;
    details?: string;
    // LLM-specific fields (populated when stage === 'llm')
    modelName?: string;
    taskType?: string;  // 'plan' | 'generate' | 'heal' | 'analyze' | 'transform'
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
    issues: JobIssue[];  // Structured issues with suggestions
    llmUsage?: {         // LLM usage statistics
        totalTokensEstimated: number;
        modelUsage: {
            [modelName: string]: {
                callCount: number;
                tokensEstimated: number;
            };
        };
        taskBreakdown: {
            [taskType: string]: number; // token count per task type
        };
    };
}

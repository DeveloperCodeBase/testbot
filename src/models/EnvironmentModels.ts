/**
 * Data models for environment healing and auto-fix functionality
 */

/**
 * Records an action taken by the auto-fix system
 */
export interface AutoFixAction {
    project: string;
    path: string;
    command: string;
    description: string;
    success: boolean;
    stdout?: string;
    stderr?: string;
    timestamp: string;
}

/**
 * Represents a step in the remediation process
 */
export interface RemediationStep {
    title: string;
    description: string;
    command?: string;
    filePath?: string;
}

/**
 * Issue severity levels
 */
export type IssueSeverity = 'info' | 'warning' | 'error';

/**
 * Stage where the issue was detected
 */
export type IssueStage = 'analysis' | 'generation' | 'execution' | 'env-setup';

/**
 * Represents an environment or configuration issue
 */
export interface EnvironmentIssue {
    project: string;
    stage: IssueStage;
    severity: IssueSeverity;
    code: string;  // e.g. 'MISSING_DEV_DEP', 'CONFIG_MISMATCH', 'MISSING_TEST_RUNNER', 'TEST_SYNTAX_ERROR'
    message: string;
    details?: string;
    filePath?: string; // User-visible file path (project files, config files, not internal stack traces)
    line?: number;     // Line number for syntax errors
    column?: number;   // Column number for syntax errors
    autoFixed: boolean;
    autoFixActions?: AutoFixAction[];
    remediation?: RemediationStep[];
    timestamp?: string;
}

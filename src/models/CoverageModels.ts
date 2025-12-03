export interface CoverageMetrics {
    total: number;
    covered: number;
    skipped: number;
    pct: number;
}

export interface FileCoverage {
    path: string;
    statements: CoverageMetrics;
    branches: CoverageMetrics;
    functions: CoverageMetrics;
    lines: CoverageMetrics;
    uncoveredLines: number[];
}

export interface CoverageReport {
    project: string;
    timestamp: string;
    overall: {
        statements: CoverageMetrics;
        branches: CoverageMetrics;
        functions: CoverageMetrics;
        lines: CoverageMetrics;
    };
    files: FileCoverage[];
}

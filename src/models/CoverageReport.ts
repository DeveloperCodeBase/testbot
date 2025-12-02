/**
 * Coverage summary for a file or overall
 */
export interface CoverageSummary {
    total: number;
    covered: number;
    percentage: number;
}

/**
 * Coverage data for a specific file
 */
export interface FileCoverage {
    path: string;
    lines: CoverageSummary;
    functions: CoverageSummary;
    branches: CoverageSummary;
    statements?: CoverageSummary;
    uncoveredLines: number[];
    uncoveredFunctions?: string[];
}

/**
 * Complete coverage report
 */
export interface CoverageReport {
    overall: {
        lines: CoverageSummary;
        functions: CoverageSummary;
        branches: CoverageSummary;
        statements?: CoverageSummary;
    };
    files: FileCoverage[];
    timestamp: string;
}

/**
 * Coverage gap identified for refinement
 */
export interface CoverageGap {
    file: string;
    type: 'file' | 'function' | 'branch';
    description: string;
    priority: 'high' | 'medium' | 'low';
    uncoveredLines?: number[];
    uncoveredFunctions?: string[];
}

import { execAsync } from '../utils/execUtils';
import { fileExists, readFile } from '../utils/fileUtils';
import logger from '../utils/logger';
import path from 'path';

/**
 * Validates TypeScript and JavaScript syntax before test execution
 */
export interface SyntaxError {
    file: string;
    line: number;
    column: number;
    message: string;
    code?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: SyntaxError[];
    warnings: string[];
}

export class SyntaxValidator {
    /**
     * Validate TypeScript files using tsc
     */
    async validateTypeScript(
        projectPath: string,
        files: string[]
    ): Promise<ValidationResult> {
        logger.info(`Validating TypeScript syntax for ${files.length} files`);

        const errors: SyntaxError[] = [];
        const warnings: string[] = [];

        // Check if TypeScript is available
        const hasTsConfig = await fileExists(path.join(projectPath, 'tsconfig.json'));

        if (!hasTsConfig) {
            logger.warn('No tsconfig.json found, skipping TypeScript validation');
            return { valid: true, errors: [], warnings: ['No tsconfig.json found'] };
        }

        try {
            // Run tsc --noEmit to check syntax without generating output
            const { stdout, stderr } = await execAsync(
                `cd "${projectPath}" && npx tsc --noEmit --pretty false`,
                { timeout: 30000 }
            );

            // Parse TypeScript compiler output
            const output = stdout + stderr;
            const errorMatches = output.matchAll(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm);

            for (const match of errorMatches) {
                const [, file, line, column, code, message] = match;

                // Only track errors in our generated test files
                if (files.some(f => file.includes(path.basename(f)))) {
                    errors.push({
                        file: file.trim(),
                        line: parseInt(line, 10),
                        column: parseInt(column, 10),
                        message: message.trim(),
                        code: code
                    });
                }
            }

            logger.info(`TypeScript validation: ${errors.length} errors found`);

        } catch (error: any) {
            // tsc exits with non-zero on errors, which is expected
            if (error.stdout || error.stderr) {
                const output = (error.stdout || '') + (error.stderr || '');
                const errorMatches = output.matchAll(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm);

                for (const match of errorMatches) {
                    const [, file, line, column, code, message] = match;

                    if (files.some(f => file.includes(path.basename(f)))) {
                        errors.push({
                            file: file.trim(),
                            line: parseInt(line, 10),
                            column: parseInt(column, 10),
                            message: message.trim(),
                            code: code
                        });
                    }
                }
            } else {
                logger.error(`TypeScript validation failed: ${error.message}`);
                warnings.push(`TypeScript validation error: ${error.message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate JavaScript/JSX files using basic parsing
     */
    async validateJavaScript(
        _projectPath: string,
        files: string[]
    ): Promise<ValidationResult> {
        logger.info(`Validating JavaScript syntax for ${files.length} files`);

        const errors: SyntaxError[] = [];
        const warnings: string[] = [];

        for (const file of files) {
            try {
                const content = await readFile(file);

                // Basic syntax checks
                const issues = this.detectCommonSyntaxIssues(content, file);
                errors.push(...issues);

            } catch (error: any) {
                warnings.push(`Failed to read ${file}: ${error.message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Detect common syntax issues in code
     */
    private detectCommonSyntaxIssues(content: string, file: string): SyntaxError[] {
        const issues: SyntaxError[] = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            // Check for missing semicolons (basic heuristic)
            if (this.likelyMissingSemicolon(line)) {
                issues.push({
                    file,
                    line: index + 1,
                    column: line.length,
                    message: 'Possibly missing semicolon',
                    code: 'SYNTAX001'
                });
            }

            // Check for unmatched brackets
            const openCount = (line.match(/\{/g) || []).length;
            const closeCount = (line.match(/\}/g) || []).length;
            if (openCount !== closeCount && !line.trim().startsWith('//')) {
                issues.push({
                    file,
                    line: index + 1,
                    column: 1,
                    message: 'Possibly unmatched braces on this line',
                    code: 'SYNTAX002'
                });
            }
        });

        return issues;
    }

    /**
     * Heuristic to detect likely missing semicolons
     */
    private likelyMissingSemicolon(line: string): boolean {
        const trimmed = line.trim();

        // Skip empty lines, comments, and lines that already end with semicolon/brace
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
            return false;
        }

        if (trimmed.endsWith(';') || trimmed.endsWith('{') || trimmed.endsWith('}') ||
            trimmed.endsWith(',') || trimmed.endsWith('(') || trimmed.endsWith(')')) {
            return false;
        }

        // Check if line looks like a statement that should end with semicolon
        const statementPatterns = [
            /^(const|let|var)\s+\w+\s*=\s*.+[^;]$/,
            /^return\s+.+[^;]$/,
            /^throw\s+.+[^;]$/,
            /^\w+\(.*\)[^;]$/,  // function call
        ];

        return statementPatterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Format validation errors for display
     */
    formatErrors(errors: SyntaxError[]): string {
        return errors.map(err => {
            const location = `${err.file}:${err.line}:${err.column}`;
            const code = err.code ? ` [${err.code}]` : '';
            return `${location}${code} - ${err.message}`;
        }).join('\n');
    }
}

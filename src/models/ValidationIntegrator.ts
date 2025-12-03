import { SyntaxValidator, ValidationResult } from '../validator/SyntaxValidator.js';
import { EnvironmentIssue } from './EnvironmentModels.js';

/**
 * Integrates syntax validation into test execution flow
 */
export class ValidationIntegrator {
    private validator: SyntaxValidator;

    constructor() {
        this.validator = new SyntaxValidator();
    }

    /**
     * Validate generated test files before execution
     */
    async validateBeforeExecution(
        projectPath: string,
        generatedFiles: string[],
        language: string
    ): Promise<{ valid: boolean; issues: EnvironmentIssue[] }> {
        const issues: EnvironmentIssue[] = [];

        if (language === 'typescript' || language === 'javascript') {
            // Filter for TypeScript/JavaScript test files
            const tsFiles = generatedFiles.filter(f =>
                f.endsWith('.ts') || f.endsWith('.tsx') ||
                f.endsWith('.js') || f.endsWith('.jsx')
            );

            if (tsFiles.length === 0) {
                return { valid: true, issues: [] };
            }

            // Validate TypeScript files
            if (tsFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
                const result = await this.validator.validateTypeScript(projectPath, tsFiles);

                if (!result.valid) {
                    issues.push(...this.createSyntaxIssues(result, projectPath));
                }
            }
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Create environment issues from syntax validation errors
     */
    private createSyntaxIssues(result: ValidationResult, projectPath: string): EnvironmentIssue[] {
        const issues: EnvironmentIssue[] = [];

        for (const error of result.errors) {
            issues.push({
                project: projectPath,
                stage: 'generation',
                severity: 'error',
                code: 'TEST_SYNTAX_ERROR',
                message: `TypeScript syntax error in generated test`,
                details: `${error.file}:${error.line}:${error.column} - ${error.message}${error.code ? ` [${error.code}]` : ''}`,
                filePath: error.file,
                line: error.line,
                column: error.column,
                autoFixed: false,
                remediation: [{
                    title: 'Fix TypeScript syntax',
                    description: `Review and fix the syntax error at line ${error.line}`,
                    filePath: error.file
                }],
                timestamp: new Date().toISOString()
            });
        }

        return issues;
    }
}

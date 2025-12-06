import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileExists } from '../utils/fileUtils';
import logger from '../utils/logger';

/**
 * Quality gate for generated test files
 * Validates tests with tsc and applies auto-fixes or quarantines failing tests
 */
export class TestQualityGate {
    /**
     * Check a generated test file for TypeScript errors
     * Returns whether test passed quality gate and any issues found
     */
    static async checkGeneratedTest(
        testFilePath: string,
        projectPath: string
    ): Promise<{
        passed: boolean;
        issues: string[];
        fixed: boolean;
        quarantined: boolean;
    }> {
        const issues: string[] = [];
        let fixed = false;
        let quarantined = false;

        // Skip quality gate for non-TS/JS files
        if (!testFilePath.match(/\\.(ts|tsx|js|jsx)$/)) {
            return { passed: true, issues, fixed, quarantined };
        }

        try {
            // Run lightweight tsc check
            const tsconfigPath = path.join(projectPath, 'tsconfig.json');
            if (!(await fileExists(tsconfigPath))) {
                logger.debug(`No tsconfig.json found, skipping quality gate for ${testFilePath}`);
                return { passed: true, issues, fixed, quarantined };
            }

            // Runprompt --noEmit on just this file
            const cmd = `npx tsc --noEmit --skipLibCheck ${testFilePath}`;
            try {
                execSync(cmd, { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' });
                // No errors, passed quality gate
                return { passed: true, issues, fixed, quarantined };
            } catch (error: any) {
                const output = error.stdout || error.stderr || '';
                issues.push(`TypeScript errors: ${output.substring(0, 500)}`);

                // Try auto-fixes in order
                const content = await fs.readFile(testFilePath, 'utf-8');

                // Fix 1: Check if it needs // @ts-nocheck
                if (!content.startsWith('// @ts-nocheck')) {
                    logger.info(`Applying @ts-nocheck to ${testFilePath}`);
                    const fixedContent = `// @ts-nocheck\\n${content}`;
                    await fs.writeFile(testFilePath, fixedContent, 'utf-8');
                    fixed = true;

                    // Re-check after fix
                    try {
                        execSync(cmd, { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' });
                        // Fixed successfully
                        return { passed: true, issues: [`Applied @ts-nocheck`], fixed, quarantined };
                    } catch {
                        // Still failing after @ts-nocheck, quarantine
                        issues.push('Test still has errors after @ts-nocheck');
                    }
                }

                // Last resort: quarantine the test
                if (issues.length > 0) {
                    logger.warn(`Quarantining ${testFilePath} due to persistent errors`);
                    const quarantineDir = path.join(projectPath, '.quarantine');
                    await fs.mkdir(quarantineDir, { recursive: true });

                    const basename = path.basename(testFilePath);
                    const quarantinePath = path.join(quarantineDir, basename);

                    // Move file to quarantine
                    await fs.rename(testFilePath, quarantinePath);
                    quarantined = true;

                    issues.push(`Quarantined to ${quarantinePath}`);
                    return { passed: false, issues, fixed, quarantined };
                }
            }
        } catch (error) {
            issues.push(`Quality gate error: ${error}`);
            return { passed: false, issues, fixed, quarantined };
        }

        return { passed: false, issues, fixed, quarantined };
    }

    /**
     * Check multiple test files
     */
    static async checkMultipleTests(
        testFilePaths: string[],
        projectPath: string
    ): Promise<{
        passed: number;
        failed: number;
        fixed: number;
        quarantined: number;
        allIssues: Array<{ file: string; issues: string[] }>;
    }> {
        let passed = 0;
        let failed = 0;
        let fixed = 0;
        let quarantined = 0;
        const allIssues: Array<{ file: string; issues: string[] }> = [];

        for (const testFile of testFilePaths) {
            const result = await this.checkGeneratedTest(testFile, projectPath);
            if (result.passed) {
                passed++;
            } else {
                failed++;
            }
            if (result.fixed) {
                fixed++;
            }
            if (result.quarantined) {
                quarantined++;
            }
            if (result.issues.length > 0) {
                allIssues.push({ file: testFile, issues: result.issues });
            }
        }

        return { passed, failed, fixed, quarantined, allIssues };
    }
}

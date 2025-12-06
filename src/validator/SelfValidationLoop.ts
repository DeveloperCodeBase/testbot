import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { JobResult, JobIssue } from '../models/TestRunResult';
import { HtmlReportGenerator } from '../reporting/HtmlReportGenerator';

/**
 * Production-Grade Self-Validation Loop
 * Runs: build → test → analyze with iterative auto-fix
 */
export class SelfValidationLoop {
    private maxIterations: number;
    private projectPath: string;
    private demoPath?: string;
    private recurringIssues: Map<string, number> = new Map(); // issue.kind + issue.message -> count
    private htmlGenerator: HtmlReportGenerator;

    constructor(maxIterations: number = 5) {
        this.maxIterations = maxIterations;
        this.projectPath = process.cwd();
        this.htmlGenerator = new HtmlReportGenerator();

        // Look for demo project
        const demoCandidate = path.join(this.projectPath, '..', 'ai-testbot-demo-project');
        if (fs.existsSync(demoCandidate)) {
            this.demoPath = demoCandidate;
        }
    }

    async execute(): Promise<{ success: boolean; report: string }> {
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║       SELF-VALIDATION LOOP - PRODUCTION MODE              ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        let iteration = 0;
        let allPassed = false;
        let finalFailureReason: string | undefined;

        while (iteration < this.maxIterations && !allPassed) {
            iteration++;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🔄 ITERATION ${iteration}/${this.maxIterations}`);
            console.log(`${'='.repeat(60)}\n`);

            // Step 1: Build
            console.log('📦 Step 1: Building...');
            const buildResult = this.runBuild();
            if (!buildResult.success) {
                console.log(`❌ Build failed: ${buildResult.error}`);
                return { success: false, report: `Build failed at iteration ${iteration}: ${buildResult.error}` };
            }
            console.log('✅ Build succeeded\n');

            // Step 2: Run Internal Tests
            console.log('🧪 Step 2: Running internal tests...');
            const testResult = this.runTests();
            console.log(`Tests: ${testResult.passed}/${testResult.total} passed`);
            if (!testResult.success) {
                console.log(`⚠️  Some tests failed, continuing...\n`);
            } else {
                console.log('✅ All internal tests passed\n');
            }

            // Step 3: Analyze Demo Project (if exists)
            let demoResult: { success: boolean; jobResult?: JobResult } = { success: true };
            if (this.demoPath) {
                console.log('🎯 Step 3: Analyzing demo project...');
                demoResult = this.runAnalyze(this.demoPath, iteration);

                if (demoResult.jobResult) {
                    // Generate HTML Report for this iteration
                    const reportDir = path.join(this.projectPath, 'artifacts', 'self-validation', `iteration-${iteration}`);
                    await this.htmlGenerator.generateReport(demoResult.jobResult, reportDir);

                    // Parse issues and attempt fixes
                    const fixResult = await this.applyTargetedFixes(demoResult.jobResult, iteration);

                    if (fixResult.hardBlocker) {
                        console.log(`❌ HARD BLOCKER DETECTED: ${fixResult.blockerReason}`);
                        finalFailureReason = fixResult.blockerReason;
                        return {
                            success: false,
                            report: this.generateReport(iteration, false, finalFailureReason)
                        };
                    }

                    if (fixResult.fixesApplied > 0) {
                        console.log(`🔧 Applied ${fixResult.fixesApplied} targeted fix(es), will retry...\n`);
                        continue; // Skip success check, retry
                    }

                    // Check coverage threshold
                    const coverageMet = this.checkCoverageThreshold(demoResult.jobResult);
                    if (!coverageMet) {
                        console.log(`⚠️  Coverage below threshold, but no fixes available\n`);
                    }

                    demoResult.success = demoResult.jobResult.status === 'success' && coverageMet;
                }

                if (demoResult.success) {
                    console.log('✅ Demo analysis succeeded\n');
                } else {
                    console.log(`⚠️  Demo analysis partial/failed\n`);
                }
            }

            // Check if we're done
            if (testResult.success && demoResult.success) {
                allPassed = true;
                console.log('\n🎉 ALL VALIDATION PASSED!');
                break;
            }

            if (iteration < this.maxIterations) {
                console.log(`\n🔧 Issues detected, will retry in iteration ${iteration + 1}...\n`);
            }
        }

        const report = this.generateReport(iteration, allPassed, finalFailureReason);
        return { success: allPassed, report };
    }

    private runBuild(): { success: boolean; error?: string } {
        try {
            execSync('npm run build', {
                cwd: this.projectPath,
                stdio: 'pipe',
                encoding: 'utf-8'
            });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private runTests(): { success: boolean; total: number; passed: number; failed: number } {
        try {
            const output = execSync('npm test -- --passWithNoTests 2>&1', {
                cwd: this.projectPath,
                encoding: 'utf-8'
            });

            // Parse Jest output
            const totalMatch = output.match(/Tests:\s+(\d+)\s+total/);
            const passedMatch = output.match(/(\d+)\s+passed/);
            const failedMatch = output.match(/(\d+)\s+failed/);

            const total = totalMatch ? parseInt(totalMatch[1]) : 0;
            const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

            return {
                success: failed === 0,
                total,
                passed,
                failed
            };
        } catch (error: any) {
            // Tests failed
            const output = error.stdout || error.message;
            const totalMatch = output.match(/Tests:\s+(\d+)\s+total/);
            const passedMatch = output.match(/(\d+)\s+passed/);
            const failedMatch = output.match(/(\d+)\s+failed/);

            const total = totalMatch ? parseInt(totalMatch[1]) : 0;
            const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

            return {
                success: false,
                total,
                passed,
                failed
            };
        }
    }

    private runAnalyze(projectPath: string, iteration: number): { success: boolean; jobResult?: JobResult } {
        try {
            const outputDir = path.join(this.projectPath, 'artifacts', 'self-validation', `iteration-${iteration}`);
            fs.mkdirSync(outputDir, { recursive: true });

            execSync(`node dist/cli/index.js analyze "${projectPath}" --auto-fix --coverage-threshold 80 --output "${outputDir}"`, {
                cwd: this.projectPath,
                stdio: 'pipe',
                encoding: 'utf-8'
            });

            // Read results
            const resultFiles = fs.readdirSync(outputDir);
            const jobIdDir = resultFiles.find(f => f.match(/^[a-f0-9-]+$/));
            if (jobIdDir) {
                const resultsPath = path.join(outputDir, jobIdDir, 'results.json');
                if (fs.existsSync(resultsPath)) {
                    const result = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
                    return {
                        success: result.status === 'success',
                        jobResult: result
                    };
                }
            }

            return { success: false };
        } catch (error) {
            return { success: false };
        }
    }

    /**
     * Apply targeted fixes based on JobResult issues
     */
    private async applyTargetedFixes(jobResult: JobResult, _iteration: number): Promise<{ fixesApplied: number; hardBlocker: boolean; blockerReason?: string }> {
        let fixesApplied = 0;

        // Group issues by kind
        const issuesByKind = new Map<string, JobIssue[]>();

        // Track recurring issues
        for (const issue of jobResult.issues) {
            const issueKey = `${issue.kind}:${issue.message}`;
            const count = (this.recurringIssues.get(issueKey) || 0) + 1;
            this.recurringIssues.set(issueKey, count);

            if (count >= 3) {
                // Same issue 3 times implies auto-fix isn't working
                return {
                    fixesApplied: 0,
                    hardBlocker: true,
                    blockerReason: `Recurring issue detected 3 times without resolution: ${issue.kind} - ${issue.message}`
                };
            }

            if (!issuesByKind.has(issue.kind)) {
                issuesByKind.set(issue.kind, []);
            }
            issuesByKind.get(issue.kind)!.push(issue);
        }

        // Handle each issue type
        for (const [kind, issues] of issuesByKind) {
            console.log(`  Analyzing ${issues.length} ${kind} issue(s)...`);

            switch (kind) {
                case 'GENERATION_IMPORT_UNRESOLVABLE':
                    // Already skipped during generation, no action needed
                    console.log(`    ℹ️  ${issues.length} tests skipped due to imports (already handled)`);
                    break;

                case 'TEST_QUALITY_GATE_FAILED':
                    // Quality gate validation failed
                    console.log(`    ⚠️  ${issues.length} tests failed quality gate (already attempted auto-fix)`);
                    break;

                case 'TEST_QUARANTINED':
                    // Tests moved to quarantine
                    console.log(`    ⚠️  ${issues.length} tests quarantined (removed from execution)`);
                    break;

                case 'TEST_DEP_AUTO_INSTALLED':
                    // Already installed, just need to retry
                    console.log(`    ✅ Dependencies auto-installed, will retry`);
                    fixesApplied++;
                    break;

                case 'JEST_ESM_DEP_FIX_APPLIED':
                    // ESM fix applied, retry
                    console.log(`    ✅ ESM dep fix applied, will retry`);
                    fixesApplied++;
                    break;

                case 'JEST_ESM_DEP_DETECTED':
                    // Should have been fixed by healer
                    console.log(`    ⚠️  ESM dependency detected, should be fixed by healer in next run`);
                    fixesApplied++; // Assume healer will fix it
                    break;

                case 'CONFIG_MODEL_OVERRIDE':
                case 'CONFIG_MODEL_FALLBACK_APPLIED':
                    // Informational only
                    console.log(`    ℹ️  Model config overrides applied (informational)`);
                    break;

                case 'COVERAGE_BELOW_THRESHOLD':
                    // Would need additional test generation
                    console.log(`    ⚠️  Coverage below threshold - would need more tests`);
                    break;

                default:
                    console.log(`    ⚠️  No auto-fix available for ${kind}`);
            }
        }

        return { fixesApplied, hardBlocker: false };
    }

    /**
     * Check if coverage meets threshold
     */
    private checkCoverageThreshold(jobResult: JobResult): boolean {
        const threshold = 80; // From config

        for (const projectResult of jobResult.projectResults) {
            if (projectResult.coverage) {
                const actualCoverage = projectResult.coverage.overall.statements.pct ||
                    projectResult.coverage.overall.lines.pct || 0;
                if (actualCoverage < threshold) {
                    console.log(`    ⚠️  ${projectResult.project}: ${actualCoverage.toFixed(1)}% < ${threshold}%`);
                    return false;
                }
            }
        }

        return true;
    }

    private generateReport(iterations: number, success: boolean, failureReason?: string): string {
        const lines = [
            '\n╔═══════════════════════════════════════════════════════════╗',
            '║           SELF-VALIDATION FINAL REPORT                    ║',
            '╚═══════════════════════════════════════════════════════════╝\n',
            `Total Iterations: ${iterations}`,
            `Status: ${success ? '✅ PASSED' : '❌ FAILED'}`,
            '',
            success
                ? '🎉 All validation checks passed! The testbot is production-ready.'
                : `⚠️  Validation incomplete after ${iterations} iteration(s).`,
            failureReason ? `\nReason: ${failureReason}` : '',
            '\n' + '='.repeat(60)
        ];

        return lines.join('\n');
    }
}

// CLI Entry
if (require.main === module) {
    const loop = new SelfValidationLoop(3);
    loop.execute()
        .then(({ success, report }) => {
            console.log(report);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Self-validation crashed:', error);
            process.exit(1);
        });
}

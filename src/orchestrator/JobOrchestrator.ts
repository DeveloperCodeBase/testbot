import { RepoAnalysis } from '../models/ProjectDescriptor';
import { RepoManager } from '../repo/RepoManager';
import { StackDetector } from '../analyzer/StackDetector';
import { TestGenerator } from '../generator/TestGenerator';
import { TestExecutor } from '../executor/TestExecutor';
import { JobResult, TestRunResult, JobIssue } from '../models/TestRunResult';
import { BotConfig } from '../config/schema';
import logger from '../utils/logger';
import { ensureDir } from '../utils/fileUtils';
import { EnvironmentHealer } from '../env/EnvironmentHealer';
import { NodeEnvironmentHealer } from '../env/NodeEnvironmentHealer';
import { PythonEnvironmentHealer } from '../env/PythonEnvironmentHealer';
import { JavaEnvironmentHealer } from '../env/JavaEnvironmentHealer';
import { CSharpEnvironmentHealer } from '../env/CSharpEnvironmentHealer';
import { EnvironmentIssue, AutoFixAction } from '../models/EnvironmentModels';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { LLMError, LLMErrorCategory } from '../llm/OpenRouterClient';
import { ConfigDiagnostics } from '../config/ConfigLoader';
import path from 'path';

/**
 * Job state
 */
export type JobState =
    | 'INIT'
    | 'CLONE'
    | 'ANALYZE'
    | 'GENERATE'
    | 'ENV_HEAL'
    | 'EXECUTE'
    | 'REFINE'
    | 'FINALIZE'
    | 'COMPLETE'
    | 'FAILED';

/**
 * Main orchestrator for test bot jobs
 */
export class JobOrchestrator {
    private config: BotConfig;
    private repoManager: RepoManager;
    private state: JobState = 'INIT';
    private jobId: string = '';
    private errors: string[] = [];
    private jobIssues: JobIssue[] = []; // Collects LLM and other global issues
    private testGenerator?: TestGenerator; // Track for LLM usage stats
    private configDiagnostics?: ConfigDiagnostics; // Track config source and model resolution

    constructor(config: BotConfig, configDiagnostics?: ConfigDiagnostics) {
        this.config = config;
        this.repoManager = new RepoManager();
        this.configDiagnostics = configDiagnostics;

        // Create CONFIG_MODEL_OVERRIDE issues if any fallbacks were applied
        if (configDiagnostics?.fallbacksApplied && configDiagnostics.fallbacksApplied.length > 0) {
            configDiagnostics.fallbacksApplied.forEach(fallback => {
                this.jobIssues.push({
                    id: `config-model-override-${fallback.field}`,
                    project: 'all',
                    stage: 'env_heal',
                    kind: 'CONFIG_MODEL_OVERRIDE',
                    severity: 'warning',
                    message: `Model '${fallback.field}' was overridden: ${fallback.original} → ${fallback.resolved}`,
                    suggestion: `Update your config file to use paid models directly`,
                    details: fallback.reason
                });
            });
        }
    }

    /**
     * Execute the complete job pipeline
     */
    async execute(repoInput: string): Promise<JobResult> {
        const startTime = new Date().toISOString();
        const startTimestamp = Date.now();

        try {
            // CLONE
            this.setState('CLONE');
            const { repoPath, jobId, isLocal } = await this.repoManager.prepareRepo(repoInput);
            this.jobId = jobId;

            // Set up artifacts directory
            const artifactsDir = path.join(this.config.output.artifacts_dir, jobId);
            await ensureDir(artifactsDir);

            // ANALYZE
            this.setState('ANALYZE');
            const analysis = await this.analyzeRepo(repoPath);

            // GENERATE
            this.setState('GENERATE');
            const generatedFilesMap = await this.generateTests(analysis, repoPath);
            const allGeneratedFiles = Array.from(generatedFilesMap.values()).flat();

            // ENV_HEAL
            this.setState('ENV_HEAL');
            const healingResults = await this.healEnvironments(analysis, repoPath, generatedFilesMap);

            // EXECUTE
            this.setState('EXECUTE');
            let projectResults = await this.executeTests(analysis, repoPath, artifactsDir, generatedFilesMap, healingResults);

            // REFINE
            this.setState('REFINE');
            const maxIterations = this.config.refinement?.max_iterations || 3;
            let iteration = 0;

            while (iteration < maxIterations) {
                iteration++;
                logger.info(`\n🔄 Refinement Iteration ${iteration}/${maxIterations}`);

                const needsRefinement = await this.analyzeForRefinement(projectResults, healingResults);
                if (!needsRefinement) {
                    logger.info('✅ No further refinement needed');
                    break;
                }

                // Apply targeted healing and regeneration
                await this.applyRefinement(
                    analysis,
                    repoPath,
                    projectResults,
                    healingResults,
                    generatedFilesMap
                );

                // Re-execute tests for affected projects
                logger.info('Running tests after refinement...');
                projectResults = await this.executeTests(analysis, repoPath, artifactsDir, generatedFilesMap, healingResults);
            }

            // FINALIZE
            this.setState('FINALIZE');

            // Self-inspection
            const result = this.createJobResult(
                repoInput,
                repoPath,
                isLocal,
                startTime,
                startTimestamp,
                projectResults,
                allGeneratedFiles,
                healingResults
            );

            // Analyze result and update status if needed
            this.analyzeResult(result);

            // Cleanup
            if (!isLocal) {
                await this.repoManager.cleanup(jobId);
            }

            this.setState('COMPLETE');
            logger.info(`Job ${jobId} completed with status: ${result.status}`);

            return result;
        } catch (error) {
            this.setState('FAILED');
            logger.error(`Job failed: ${error}`);
            this.errors.push(error instanceof Error ? error.message : String(error));

            return this.createFailedJobResult(repoInput, startTime, startTimestamp, this.errors);
        }
    }

    /**
     * Analyze repository
     */
    private async analyzeRepo(repoPath: string): Promise<RepoAnalysis> {
        logger.info('Analyzing repository...');
        const detector = new StackDetector(repoPath);
        return await detector.analyze();
    }

    /**
     * Generate tests for all projects
     */
    private async generateTests(analysis: RepoAnalysis, repoPath: string): Promise<Map<string, string[]>> {
        logger.info('Generating tests...');
        this.testGenerator = new TestGenerator(this.config);
        const projectFiles = new Map<string, string[]>();

        for (const project of analysis.projects) {
            const projectPath = path.join(repoPath, project.path);
            try {
                const results = await this.testGenerator.generateAllTests(project, projectPath);

                // Collect errors from generation
                if (results.errors && results.errors.length > 0) {
                    this.errors.push(...results.errors);
                }

                const files = [...results.unit, ...results.integration, ...results.e2e];
                projectFiles.set(project.name, files);

                // Log diagnostic information
                if (files.length === 0) {
                    const msg = `No tests generated for project ${project.name}. Check: LLM configuration, source file discovery, or generation errors above.`;
                    logger.warn(msg);
                    this.errors.push(msg);
                }
            } catch (error) {
                this.handleLLMError(error, project.name, 'generate');
                projectFiles.set(project.name, []);
            }
        }

        return projectFiles;
    }

    /**
     * Heal environments for all projects
     */
    private async healEnvironments(
        analysis: RepoAnalysis,
        repoPath: string,
        generatedFilesMap: Map<string, string[]>
    ): Promise<Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>> {
        logger.info('Healing environments...');
        const results = new Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>();

        for (const project of analysis.projects) {
            try {
                const healer = this.createHealer(project);
                const projectPath = path.join(repoPath, project.path);
                const generatedFiles = generatedFilesMap.get(project.name) || [];

                await healer.analyze(project, projectPath, generatedFiles);
                await healer.heal(projectPath);

                results.set(project.name, {
                    issues: healer.getIssues(),
                    actions: healer.getActions(),
                });
            } catch (error) {
                logger.error(`Failed to heal environment for ${project.name}: ${error}`);
                this.handleLLMError(error, project.name, 'env_heal');
                this.errors.push(`Environment healing failed for ${project.name}: ${error}`);
            }
        }

        return results;
    }

    /**
     * Handle LLM errors and create JobIssues
     */
    private handleLLMError(error: unknown, project: string, stage: JobIssue['stage']): void {
        if (error instanceof LLMError) {
            const severity = error.category === LLMErrorCategory.RATE_LIMIT ? 'warning' : 'error';

            this.jobIssues.push({
                id: `${project}-${stage}-${error.category}-${Date.now()}`,
                project,
                stage,
                kind: error.category,
                severity,
                message: error.message,
                suggestion: error.suggestedRemediation || 'Check logs for details',
                details: error.rawMessage,
                modelName: error.modelId,
                taskType: error.task
            });
        } else {
            // Generic error
            this.jobIssues.push({
                id: `${project}-${stage}-UNKNOWN-${Date.now()}`,
                project,
                stage,
                kind: 'UNKNOWN_ERROR',
                severity: 'error',
                message: error instanceof Error ? error.message : String(error),
                suggestion: 'Check system logs and configuration'
            });
        }
    }

    /**
     * Create appropriate healer for project
     */
    private createHealer(project: ProjectDescriptor): EnvironmentHealer {
        const lang = project.language.toLowerCase();
        if (lang === 'typescript' || lang === 'javascript') {
            return new NodeEnvironmentHealer(this.config);
        } else if (lang === 'python') {
            return new PythonEnvironmentHealer(this.config);
        } else if (lang === 'java') {
            return new JavaEnvironmentHealer(this.config);
        } else if (lang === 'csharp' || lang === 'c#') {
            return new CSharpEnvironmentHealer(this.config);
        }
        // No healer available for this language
        throw new Error(`No environment healer available for language: ${project.language}`);
    }

    /**
     * Execute tests for all projects
     */
    private async executeTests(
        analysis: RepoAnalysis,
        repoPath: string,
        artifactsDir: string,
        generatedFilesMap: Map<string, string[]>,
        healingResults: Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>
    ): Promise<TestRunResult[]> {
        logger.info('Executing tests...');
        const executor = new TestExecutor(this.config, artifactsDir);
        const results: TestRunResult[] = [];

        for (const project of analysis.projects) {
            const projectPath = path.join(repoPath, project.path);
            const testTypes: ('unit' | 'integration' | 'e2e')[] = [];

            if (this.config.enabled_tests.unit) testTypes.push('unit');
            if (this.config.enabled_tests.integration) testTypes.push('integration');
            if (this.config.enabled_tests.e2e) testTypes.push('e2e');

            try {
                const envResult = healingResults.get(project.name);
                const result = await executor.executeTests(
                    project,
                    projectPath,
                    testTypes,
                    envResult?.issues || [],
                    envResult?.actions || []
                );
                result.generatedTestFiles = generatedFilesMap.get(project.name) || [];
                results.push(result);
            } catch (error) {
                logger.error(`Failed to execute tests for ${project.name}: ${error}`);
                this.errors.push(`Test execution failed for ${project.name}: ${error}`);
            }
        }

        return results;
    }

    /**
     * Create job result
     */
    private createJobResult(
        repoUrl: string,
        repoPath: string,
        isLocal: boolean,
        startTime: string,
        startTimestamp: number,
        projectResults: TestRunResult[],
        generatedFiles: string[],
        healingResults: Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>
    ): JobResult {
        const endTime = new Date().toISOString();
        const duration = Date.now() - startTimestamp;

        // Aggregate all environment issues and actions
        const allEnvIssues: EnvironmentIssue[] = [];
        const allAutoFixActions: AutoFixAction[] = [];
        healingResults.forEach(result => {
            allEnvIssues.push(...result.issues);
            allAutoFixActions.push(...result.actions);
        });

        // Calculate summary
        const totalTests = projectResults.reduce((sum, p) =>
            sum + p.testSuites.reduce((s, t) => s + t.testsRun, 0), 0);
        const passedTests = projectResults.reduce((sum, p) =>
            sum + p.testSuites.reduce((s, t) => s + t.testsPassed, 0), 0);
        const failedTests = projectResults.reduce((sum, p) =>
            sum + p.testSuites.reduce((s, t) => s + t.testsFailed, 0), 0);

        // Count failed suites and discovery errors
        const failedSuites = projectResults.reduce((sum, p) =>
            sum + p.testSuites.filter(s => s.status === 'failed').length, 0);
        const suitesWithDiscoveryErrors = allEnvIssues.filter(i =>
            i.code === 'NO_TESTS_FOUND' || i.code === 'PYTEST_PATTERN_MISMATCH'
        ).length;

        // Determine reason when totalTests is 0
        let reason: string | undefined;
        if (totalTests === 0 && (allEnvIssues.length > 0 || failedSuites > 0)) {
            const errorCodes = allEnvIssues
                .filter(i => i.severity === 'error')
                .map(i => i.code);

            if (errorCodes.includes('JEST_TS_CONFIG_ERROR')) {
                reason = 'Jest TypeScript config errors prevented test execution';
            } else if (errorCodes.includes('PYTEST_PATTERN_MISMATCH') || errorCodes.includes('NO_TESTS_FOUND')) {
                reason = 'Test discovery pattern mismatches prevented tests from running';
            } else if (errorCodes.includes('TEST_SYNTAX_ERROR')) {
                reason = 'Syntax errors in generated test files';
            } else if (errorCodes.length > 0) {
                reason = `Environment issues (${errorCodes.slice(0, 3).join(', ')}) prevented test execution`;
            } else {
                reason = 'No tests were generated or discovered';
            }
        }

        // Aggregate LLM usage statistics
        let llmUsage;
        if (this.testGenerator) {
            const usageData = this.testGenerator.getLLMUsageStats();
            const modelUsage: { [modelName: string]: { callCount: number; tokensEstimated: number } } = {};
            const taskBreakdown: { [taskType: string]: number } = {};

            usageData.stats.forEach(stat => {
                // Aggregate by model
                if (!modelUsage[stat.model]) {
                    modelUsage[stat.model] = { callCount: 0, tokensEstimated: 0 };
                }
                modelUsage[stat.model].callCount++;
                modelUsage[stat.model].tokensEstimated += stat.tokensEstimated;

                // Aggregate by task
                if (!taskBreakdown[stat.task]) {
                    taskBreakdown[stat.task] = 0;
                }
                taskBreakdown[stat.task] += stat.tokensEstimated;
            });

            llmUsage = {
                totalTokensEstimated: usageData.totalTokens,
                modelUsage,
                taskBreakdown
            };
        }

        // Aggregate fallback events
        if (this.testGenerator) {
            const fallbackEvents = this.testGenerator.getFallbackEvents();
            fallbackEvents.forEach(event => {
                this.jobIssues.push({
                    id: `fallback-${Date.now()}-${Math.random()}`,
                    project: 'all', // Global issue
                    stage: 'generate',
                    kind: 'MODEL_FALLBACK',
                    severity: 'warning',
                    message: `Model fallback occurred: ${event.reason}`,
                    suggestion: 'Check model availability and rate limits',
                    details: `Fallback to ${event.model} at ${event.timestamp}`,
                    modelName: event.model
                });
            });
        }

        // Combine all issues
        const issues = [
            ...this.jobIssues,
            ...this.buildJobIssues(allEnvIssues, projectResults)
        ];

        return {
            jobId: this.jobId,
            repoPath,
            repoUrl: isLocal ? undefined : repoUrl,
            status: 'success', // Will be updated by analyzeResult
            startTime,
            endTime,
            duration,
            projectResults,
            generatedTestFiles: generatedFiles,
            errors: this.errors,
            environmentIssues: allEnvIssues,
            autoFixActions: allAutoFixActions,
            summary: {
                totalProjects: projectResults.length,
                totalTests,
                passedTests,
                failedTests,
                failedSuites,
                suitesWithDiscoveryErrors,
                reason,
            },
            issues,
            llmUsage,
            modelDiagnostics: this.configDiagnostics
        };
    }

    /**
     * Analyze job result and update status
     */
    private analyzeResult(result: JobResult): void {
        const { projectResults, issues, summary } = result;

        const hasFailedProjects = projectResults.some(p => p.overallStatus === 'failed');
        const hasPartialProjects = projectResults.some(p => p.overallStatus === 'partial');
        const hasErrorIssues = issues.some(i => i.severity === 'error');
        const hasFailedSuites = summary.failedSuites ? summary.failedSuites > 0 : false;
        const hasFailedTests = summary.failedTests > 0;

        // Job is a failure if:
        // - Any project has overall status "failed"
        // - Any tests failed
        // - Any error-level issues exist
        // - Any test suite failed
        // - No tests ran but there were issues attempting to run them
        if (hasFailedProjects || hasFailedTests || hasErrorIssues || hasFailedSuites) {
            result.status = 'failed';
        } else if (summary.totalTests === 0 && issues.length > 0) {
            // If no tests ran but there are issues, mark as failure
            result.status = 'failed';
        } else if (hasPartialProjects) {
            result.status = 'partial';
        } else {
            result.status = 'success';
        }
    }

    /**
    * Convert EnvironmentIssues to JobIssues and add coverage issues
    */
    private buildJobIssues(
        envIssues: EnvironmentIssue[],
        projectResults: TestRunResult[]
    ): JobIssue[] {
        const issues: JobIssue[] = [];

        // Convert all EnvironmentIssues to JobIssues
        envIssues.forEach(envIssue => {
            const stage: JobIssue['stage'] =
                envIssue.stage === 'analysis' ? 'env_heal' :
                    envIssue.stage === 'generation' ? 'generate' :
                        envIssue.stage === 'execution' ? 'execute' :
                            envIssue.stage === 'env-setup' ? 'env_heal' : 'env_heal';

            issues.push({
                project: envIssue.project,
                stage,
                kind: envIssue.code,
                severity: envIssue.severity,
                message: envIssue.message,
                suggestion: envIssue.remediation?.[0]?.description || 'See details for remediation steps',
                details: envIssue.details
            });
        });

        // Add coverage issues for projects where coverage wasn't collected
        projectResults.forEach(p => {
            if (!p.coverage || (p.coverage.overall.statements.total === 0 && p.coverage.overall.lines.total === 0)) {
                // Only add if tests actually ran
                const testsRan = p.testSuites.reduce((sum, s) => sum + s.testsRun, 0);
                if (testsRan > 0) {
                    issues.push({
                        project: p.project,
                        stage: 'coverage',
                        kind: 'COVERAGE_NOT_COLLECTED',
                        severity: 'warning',
                        message: 'Coverage data was not collected despite tests running',
                        suggestion: 'Ensure test framework coverage reporting is properly configured'
                    });
                }
            } else if (p.coverage) {
                // Check coverage threshold
                const threshold = this.config.coverage.threshold;
                const actualCoverage = p.coverage.overall.statements.pct || p.coverage.overall.lines.pct || 0;

                if (actualCoverage < threshold) {
                    issues.push({
                        project: p.project,
                        stage: 'coverage',
                        kind: 'COVERAGE_BELOW_THRESHOLD',
                        severity: 'warning',
                        message: `Coverage ${actualCoverage.toFixed(2)}% is below threshold ${threshold}%`,
                        suggestion: `Generate more comprehensive tests to reach ${threshold}% coverage or lower the threshold in config`
                    });
                }
            }
        });

        return issues;
    }

    /**
     * Create failed job result
     */
    private createFailedJobResult(
        repoUrl: string,
        startTime: string,
        startTimestamp: number,
        errors: string[]
    ): JobResult {
        const endTime = new Date().toISOString();
        const duration = Date.now() - startTimestamp;

        return {
            jobId: this.jobId,
            repoPath: '',
            repoUrl,
            status: 'failed',
            startTime,
            endTime,
            duration,
            projectResults: [],
            generatedTestFiles: [],
            errors: errors,
            environmentIssues: [],
            autoFixActions: [],
            summary: {
                totalProjects: 0,
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                reason: 'Job failed during initialization'
            },
            issues: [{
                project: 'all',
                stage: 'env_heal',
                kind: 'INITIALIZATION_ERROR',
                severity: 'error',
                message: errors.join('; '),
                suggestion: 'Check the error details and verify the repository path'
            }]
        };
    }

    /**
     * Analyze if refinement is needed
     */
    private async analyzeForRefinement(
        projectResults: TestRunResult[],
        healingResults: Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>
    ): Promise<boolean> {
        let needed = false;

        for (const result of projectResults) {
            // Check for failures
            if (result.overallStatus !== 'passed') {
                logger.info(`Project ${result.project} needs refinement (Status: ${result.overallStatus})`);
                needed = true;
            }

            // Check for missing tests (NO_TESTS_FOUND)
            const envResult = healingResults.get(result.project);
            if (envResult) {
                const noTestsIssue = envResult.issues.find(i => i.code === 'NO_TESTS_FOUND');
                if (noTestsIssue) {
                    logger.info(`Project ${result.project} needs refinement (NO_TESTS_FOUND)`);
                    needed = true;
                }
            }
        }

        return needed;
    }

    /**
     * Apply refinement actions
     */
    private async applyRefinement(
        analysis: RepoAnalysis,
        repoPath: string,
        projectResults: TestRunResult[],
        healingResults: Map<string, { issues: EnvironmentIssue[]; actions: AutoFixAction[] }>,
        generatedFilesMap: Map<string, string[]>
    ): Promise<void> {
        for (const result of projectResults) {
            const project = analysis.projects.find(p => p.name === result.project);
            if (!project) continue;

            const projectPath = path.join(repoPath, project.path);
            const envResult = healingResults.get(project.name);
            if (!envResult) continue;

            // 1. Handle NO_TESTS_FOUND by generating minimal tests
            const noTestsIssue = envResult.issues.find(i => i.code === 'NO_TESTS_FOUND');
            if (noTestsIssue) {
                logger.info(`Fixing NO_TESTS_FOUND for ${project.name}`);

                // Determine which type is missing
                // We can check config or just try both if enabled
                if (this.config.enabled_tests.integration) {
                    const newFiles = await this.testGenerator!.generateMinimalTests(project, projectPath, 'integration');
                    if (newFiles.length > 0) {
                        const currentFiles = generatedFilesMap.get(project.name) || [];
                        generatedFilesMap.set(project.name, [...currentFiles, ...newFiles]);
                        // Mark issue as fixed? Or let next run clear it.
                        // We should remove the issue so we don't loop forever if it persists
                        envResult.issues = envResult.issues.filter(i => i.code !== 'NO_TESTS_FOUND');
                    }
                }

                if (this.config.enabled_tests.e2e) {
                    const newFiles = await this.testGenerator!.generateMinimalTests(project, projectPath, 'e2e');
                    if (newFiles.length > 0) {
                        const currentFiles = generatedFilesMap.get(project.name) || [];
                        generatedFilesMap.set(project.name, [...currentFiles, ...newFiles]);
                        envResult.issues = envResult.issues.filter(i => i.code !== 'NO_TESTS_FOUND');
                    }
                }
            }

            // 2. Handle missing dependencies (already handled by PytestAutoFixLoop/JestAutoFixLoop, but maybe we need more?)
            // The AutoFixLoops run during execution. If they failed, we might need manual intervention or different strategy.
            // But for now, we assume the loops did their best.

            // 3. Handle coverage issues?
            // If coverage is low, we could generate more tests.
            // TODO: Implement coverage-driven generation
        }
    }

    /**
     * Set job state
     */
    private setState(state: JobState): void {
        this.state = state;
        logger.info(`Job state: ${state}`);
    }

    /**
     * Get current state
     */
    getState(): JobState {
        return this.state;
    }
}

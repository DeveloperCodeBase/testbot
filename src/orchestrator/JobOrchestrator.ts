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
import { EnvironmentIssue, AutoFixAction } from '../models/EnvironmentModels';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
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
    private testGenerator?: TestGenerator; // Track for LLM usage stats

    constructor(config: BotConfig) {
        this.config = config;
        this.repoManager = new RepoManager();
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
            const projectResults = await this.executeTests(analysis, repoPath, artifactsDir, generatedFilesMap, healingResults);

            // REFINE (TODO: implement refinement loop)
            this.setState('REFINE');
            // For now, skip refinement in initial implementation

            // FINALIZE
            this.setState('FINALIZE');
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

            // Cleanup
            if (!isLocal) {
                await this.repoManager.cleanup(jobId);
            }

            this.setState('COMPLETE');
            logger.info(`Job ${jobId} completed successfully`);

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
                this.errors.push(`Environment healing failed for ${project.name}: ${error}`);
            }
        }

        return results;
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
        }
        // Return a dummy healer or throw? For now throw to be explicit, or maybe just log and return null?
        // The plan said throw, but maybe safer to have a base implementation that does nothing.
        // But since we only support these languages, throw is fine.
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

        let status: 'success' | 'failed' | 'partial' = 'success';

        const hasFailedProjects = projectResults.some(p => p.overallStatus === 'failed');
        const hasPartialProjects = projectResults.some(p => p.overallStatus === 'partial');
        const hasErrorIssues = allEnvIssues.some(i => i.severity === 'error');
        const hasFailedSuites = projectResults.some(p =>
            p.testSuites.some(s => s.status === 'failed')
        );

        // Job is a failure if:
        // - Any project has overall status "failed"
        // - Any tests failed
        // - Any error-level environment issues exist
        // - Any test suite failed
        // - No tests ran but there were issues attempting to run them
        if (hasFailedProjects || failedTests > 0 || hasErrorIssues || hasFailedSuites) {
            status = 'failed';
        } else if (totalTests === 0 && allEnvIssues.length > 0) {
            // If no tests ran but there are issues, mark as failure
            status = 'failed';
        } else if (hasPartialProjects) {
            status = 'partial';
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

        return {
            jobId: this.jobId,
            repoPath,
            repoUrl: isLocal ? undefined : repoUrl,
            status,
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
            issues: this.buildJobIssues(allEnvIssues, projectResults),
            llmUsage
        };
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
                issues.push({
                    project: p.project,
                    stage: 'coverage',
                    kind: 'COVERAGE_NOT_COLLECTED',
                    severity: 'error',
                    message: 'Tests failed before coverage could be collected',
                    suggestion: 'Fix test execution errors first, then coverage will be generated'
                });
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

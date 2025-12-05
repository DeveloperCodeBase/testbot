import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { BotConfig } from '../config/schema';
import { EnvironmentIssue, AutoFixAction, RemediationStep, IssueSeverity, IssueStage } from '../models/EnvironmentModels';
import { CommandRunner } from '../executor/CommandRunner';
import logger from '../utils/logger';

/**
 * Base class for environment healing
 * Detects and fixes environment/configuration issues
 */
export abstract class EnvironmentHealer {
    protected config: BotConfig;
    protected issues: EnvironmentIssue[] = [];
    protected actions: AutoFixAction[] = [];
    protected commandRunner: CommandRunner;

    constructor(config: BotConfig) {
        this.config = config;
        this.commandRunner = new CommandRunner();
    }

    public getConfig(): BotConfig {
        return this.config;
    }

    /**
     * Analyze the project for environment issues
     */
    abstract analyze(
        project: ProjectDescriptor,
        projectPath: string,
        generatedFiles: string[]
    ): Promise<void>;

    /**
     * Attempt to fix detected issues (if auto-fix enabled)
     */
    abstract heal(projectPath: string): Promise<void>;

    /**
     * Get all detected issues
     */
    getIssues(): EnvironmentIssue[] {
        return this.issues;
    }

    /**
     * Get all auto-fix actions taken
     */
    getActions(): AutoFixAction[] {
        return this.actions;
    }

    /**
     * Execute a command as part of auto-fix
     */
    protected async executeCommand(
        cmd: string,
        cwd: string,
        description: string,
        project: string
    ): Promise<AutoFixAction> {
        const action: AutoFixAction = {
            project,
            path: cwd,
            command: cmd,
            description,
            success: false,
            timestamp: new Date().toISOString(),
        };

        try {
            logger.info(`Auto-fix: ${description}`);
            logger.info(`Running command: ${cmd}`);

            const result = await this.commandRunner.execute(cmd, cwd, 60000);

            action.success = result.exitCode === 0;
            action.stdout = result.stdout;
            action.stderr = result.stderr;

            if (action.success) {
                logger.info(`Auto-fix succeeded: ${description}`);
            } else {
                logger.warn(`Auto-fix failed: ${description} (exit code: ${result.exitCode})`);
            }
        } catch (error) {
            action.success = false;
            action.stderr = error instanceof Error ? error.message : String(error);
            logger.error(`Auto-fix error: ${description} - ${action.stderr}`);
        }

        this.actions.push(action);
        return action;
    }

    /**
     * Add an environment issue
     */
    public addIssue(
        project: string,
        stage: IssueStage,
        severity: IssueSeverity,
        code: string,
        message: string,
        details?: string
    ): void {
        this.issues.push({
            project,
            stage,
            severity,
            code,
            message,
            details,
            autoFixed: false,
        });
    }

    /**
     * Add remediation steps to an issue
     */
    protected addRemediation(issueCode: string, steps: RemediationStep[]): void {
        const issue = this.issues.find(i => i.code === issueCode);
        if (issue) {
            issue.remediation = steps;
        }
    }

    /**
     * Mark an issue as auto-fixed
     */
    protected markIssueFixed(issueCode: string, actions: AutoFixAction[]): void {
        const issue = this.issues.find(i => i.code === issueCode);
        if (issue) {
            issue.autoFixed = true;
            issue.autoFixActions = actions;
        }
    }

    /**
     * Check if auto-fix is enabled globally
     */
    protected isAutoFixEnabled(): boolean {
        return this.config.auto_fix.enabled;
    }

    /**
     * Check if dependency installation is enabled
     */
    protected canInstallDependencies(): boolean {
        return this.config.auto_fix.enabled && this.config.auto_fix.install_dependencies;
    }

    /**
     * Check if config updates are enabled
     */
    protected canUpdateConfig(): boolean {
        return this.config.auto_fix.enabled && this.config.auto_fix.update_test_config;
    }

    /**
     * Check if virtualenv creation is enabled
     */
    protected canCreateVirtualenv(): boolean {
        return this.config.auto_fix.enabled && this.config.auto_fix.create_virtualenv;
    }
}

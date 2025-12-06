import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { BotConfig, DEFAULT_CONFIG } from './schema';
import { fileExists } from '../utils/fileUtils';
import logger from '../utils/logger';
import { JobIssue } from '../models/TestRunResult';

/**
 * Load and validate configuration
 */
export interface ConfigDiagnostics {
    configSource: string;
    modelsRequested: {
        default?: string;
        planner?: string;
        coder?: string;
        long_context?: string;
        helper?: string;
        fallback?: string;
        secondary_fallback?: string;
    };
    modelsResolved: {
        default: string;
        planner?: string;
        coder?: string;
        long_context?: string;
        helper?: string;
        fallback?: string;
        secondary_fallback?: string;
    };
    fallbacksApplied: Array<{ field: string; original: string; resolved: string; reason: string }>;
    issues: JobIssue[]; // Config-related issues for JobResult
}

export class ConfigLoader {
    private configSource: string = 'defaults';
    private modelsRequested: ConfigDiagnostics['modelsRequested'] = {};
    private fallbacksApplied: ConfigDiagnostics['fallbacksApplied'] = [];
    private configIssues: JobIssue[] = []; // Track config issues
    private resolvedModels: ConfigDiagnostics['modelsResolved'] = {
        default: '',
        planner: undefined,
        coder: undefined,
        long_context: undefined,
        helper: undefined,
        fallback: undefined,
        secondary_fallback: undefined,
    };

    // Safe paid model defaults
    private readonly SAFE_DEFAULTS = {
        default: 'qwen/qwen-2.5-coder-32b-instruct',
        planner: 'anthropic/claude-3.5-sonnet',
        coder: 'qwen/qwen-2.5-coder-32b-instruct',
        long_context: 'meta-llama/llama-3.3-70b-instruct',
        helper: 'qwen/qwen-2.5-coder-32b-instruct',
        fallback: 'qwen/qwen-2.5-coder-32b-instruct',
        secondary_fallback: 'meta-llama/llama-3.1-8b-instruct'
    };

    /**
     * Load configuration from file or use defaults
     */
    async load(configPath?: string): Promise<BotConfig> {
        let config: Partial<BotConfig> = {};

        // Load from file if provided
        if (configPath) {
            config = await this.loadFromFile(configPath);
            this.configSource = configPath;
        } else {
            // Try to find .ai-test-bot.yml in current directory
            const defaultPath = path.join(process.cwd(), '.ai-test-bot.yml');
            if (await fileExists(defaultPath)) {
                config = await this.loadFromFile(defaultPath);
                this.configSource = defaultPath;
            }
        }

        // Record requested models before validation
        this.recordRequestedModels(config);

        // Merge with defaults
        const mergedConfig = this.mergeWithDefaults(config);

        // Override with environment variables
        this.applyEnvironmentOverrides(mergedConfig);

        // Validate and resolve models (auto-fallback instead of throwing)
        this.validateAndResolveModels(mergedConfig);

        logger.info(`Configuration loaded successfully from: ${this.configSource}`);
        return mergedConfig;
    }

    /**
     * Get config diagnostics
     */
    getDiagnostics(): ConfigDiagnostics {
        return {
            configSource: this.configSource,
            modelsRequested: this.modelsRequested,
            modelsResolved: this.resolvedModels,
            fallbacksApplied: this.fallbacksApplied,
            issues: this.configIssues
        };
    }

    /**
     * Load config from file
     */
    private async loadFromFile(filePath: string): Promise<Partial<BotConfig>> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const config = yaml.load(content) as Partial<BotConfig>;
            logger.info(`Loaded config from: ${filePath}`);
            return config;
        } catch (error) {
            logger.warn(`Failed to load config from ${filePath}: ${error}`);
            return {};
        }
    }

    /**
     * Merge with default configuration
     */
    private mergeWithDefaults(config: Partial<BotConfig>): BotConfig {
        return {
            enabled_tests: { ...DEFAULT_CONFIG.enabled_tests, ...config.enabled_tests },
            auto_fix: { ...DEFAULT_CONFIG.auto_fix, ...config.auto_fix },
            coverage: { ...DEFAULT_CONFIG.coverage, ...config.coverage },
            exclude_patterns: config.exclude_patterns || DEFAULT_CONFIG.exclude_patterns,
            llm: { ...DEFAULT_CONFIG.llm, ...config.llm },
            git: { ...DEFAULT_CONFIG.git, ...config.git },
            adapters: { ...DEFAULT_CONFIG.adapters, ...config.adapters },
            execution: { ...DEFAULT_CONFIG.execution, ...config.execution },
            output: { ...DEFAULT_CONFIG.output, ...config.output },
        };
    }

    /**
     * Apply environment variable overrides
     */
    private applyEnvironmentOverrides(config: BotConfig): void {
        // API keys
        if (process.env.OPENAI_API_KEY) {
            config.llm.api_key = process.env.OPENAI_API_KEY;
        }
        if (process.env.ANTHROPIC_API_KEY && config.llm.provider === 'claude') {
            config.llm.api_key = process.env.ANTHROPIC_API_KEY;
        }
        if (process.env.GOOGLE_API_KEY && config.llm.provider === 'gemini') {
            config.llm.api_key = process.env.GOOGLE_API_KEY;
        }
        if (process.env.OPENROUTER_API_KEY && config.llm.provider === 'openrouter') {
            config.llm.api_key = process.env.OPENROUTER_API_KEY;
        }

        // LLM mode
        if (process.env.LLM_MODE) {
            config.llm.mode = process.env.LLM_MODE as 'balanced' | 'cheap' | 'premium';
        }

        // Model configuration
        if (process.env.OPENROUTER_MODEL) {
            config.llm.model = process.env.OPENROUTER_MODEL;
        }

        // Task-specific models (balanced mode)
        if (config.llm.mode === 'balanced') {
            if (!config.llm.models) {
                config.llm.models = {};
            }
            if (process.env.LLM_MODEL_PLANNER) {
                config.llm.models.planner = process.env.LLM_MODEL_PLANNER;
            }
            if (process.env.LLM_MODEL_CODER) {
                config.llm.models.coder = process.env.LLM_MODEL_CODER;
            }
            if (process.env.LLM_MODEL_LONG_CONTEXT) {
                config.llm.models.long_context = process.env.LLM_MODEL_LONG_CONTEXT;
            }
            if (process.env.LLM_MODEL_HELPER) {
                config.llm.models.helper = process.env.LLM_MODEL_HELPER;
            }
        }

        // Token budget
        if (process.env.LLM_MAX_TOKENS_PER_RUN) {
            config.llm.max_tokens_per_run = parseInt(process.env.LLM_MAX_TOKENS_PER_RUN, 10);
        }
        if (process.env.LLM_TOKEN_WARN_THRESHOLD) {
            config.llm.token_budget_warn_threshold = parseFloat(process.env.LLM_TOKEN_WARN_THRESHOLD);
        }

        // Log level
        if (process.env.LOG_LEVEL) {
            // This affects the logger global configuration
            process.env.LOG_LEVEL = process.env.LOG_LEVEL;
        }

        // Verbose mode
        if (process.env.VERBOSE === 'true') {
            config.output.verbose = true;
        }
    }

    /**
     * Record requested models before validation
     */
    private recordRequestedModels(config: Partial<BotConfig>): void {
        this.modelsRequested = {
            default: config.llm?.model,
            planner: config.llm?.models?.planner,
            coder: config.llm?.models?.coder,
            long_context: config.llm?.models?.long_context,
            helper: config.llm?.models?.helper
        };
    }

    /**
     * Validate and resolve models - auto-fallback instead of throwing errors
     */
    private validateAndResolveModels(config: BotConfig): void {
        // Validate API Key
        if (config.llm.provider === 'openrouter' && !config.llm.api_key) {
            throw new Error('Missing OPENROUTER_API_KEY. Please set it in your .env file.');
        }

        // Auto-resolve invalid models
        const resolveModel = (model: string | undefined, field: string, safeFallback: string): string => {
            if (!model) {
                return safeFallback;
            }

            // Check for :free suffix
            if (model.endsWith(':free')) {
                logger.warn(`❌ Model ${field} (${model}) is a free tier model. Auto-fallback to: ${safeFallback}`);
                this.fallbacksApplied.push({
                    field,
                    original: model,
                    resolved: safeFallback,
                    reason: 'Free tier model not allowed in production'
                });

                // Create JobIssue for this fallback
                this.configIssues.push({
                    project: 'global',
                    stage: 'config',
                    kind: 'CONFIG_MODEL_FALLBACK_APPLIED',
                    severity: 'warning',
                    message: `Model '${field}' configured as '${model}' (free tier) was replaced with '${safeFallback}'`,
                    suggestion: 'Use paid models for production. Remove :free suffix or configure a paid model.',
                    details: `Source: ${this.configSource}. Original: ${model}, Resolved: ${safeFallback}`
                });

                return safeFallback;
            }

            // Check for invalid model ID patterns
            if (!model.includes('/')) {
                logger.warn(`❌ Model ${field} (${model}) has invalid format (missing provider/). Auto-fallback to: ${safeFallback}`);
                this.fallbacksApplied.push({
                    field,
                    original: model,
                    resolved: safeFallback,
                    reason: 'Invalid model ID format'
                });

                // Create JobIssue for this fallback
                this.configIssues.push({
                    project: 'global',
                    stage: 'config',
                    kind: 'CONFIG_MODEL_FALLBACK_APPLIED',
                    severity: 'warning',
                    message: `Model '${field}' configured as '${model}' (invalid format) was replaced with '${safeFallback}'`,
                    suggestion: 'Model IDs must include provider prefix (e.g., provider/model-name)',
                    details: `Source: ${this.configSource}. Original: ${model}, Resolved: ${safeFallback}`
                });

                return safeFallback;
            }

            return model;
        };

        // Resolve all models
        config.llm.model = resolveModel(config.llm.model, 'default', this.SAFE_DEFAULTS.default);

        if (!config.llm.models) {
            config.llm.models = {};
        }
        config.llm.models.planner = resolveModel(config.llm.models.planner, 'planner', this.SAFE_DEFAULTS.planner);
        config.llm.models.coder = resolveModel(config.llm.models.coder, 'coder', this.SAFE_DEFAULTS.coder);
        config.llm.models.long_context = resolveModel(config.llm.models.long_context, 'long_context', this.SAFE_DEFAULTS.long_context);
        config.llm.models.helper = resolveModel(config.llm.models.helper, 'helper', this.SAFE_DEFAULTS.helper);

        // Capture resolved models for diagnostics and PR reporting
        this.resolvedModels = {
            default: config.llm.model,
            planner: config.llm.models.planner,
            coder: config.llm.models.coder,
            long_context: config.llm.models.long_context,
            helper: config.llm.models.helper,
            fallback: this.SAFE_DEFAULTS.fallback,
            secondary_fallback: this.SAFE_DEFAULTS.secondary_fallback,
        };

        // Log summary if any fallbacks were applied
        if (this.fallbacksApplied.length > 0) {
            logger.warn(`⚠️  Applied ${this.fallbacksApplied.length} model fallback(s) - see JobResult.issues for details`);
        }
    }
}

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { BotConfig, DEFAULT_CONFIG } from './schema';
import { fileExists } from '../utils/fileUtils';
import logger from '../utils/logger';

/**
 * Load and validate configuration
 */
export class ConfigLoader {
    /**
     * Load configuration from file or use defaults
     */
    async load(configPath?: string): Promise<BotConfig> {
        let config: Partial<BotConfig> = {};

        // Load from file if provided
        if (configPath) {
            config = await this.loadFromFile(configPath);
        } else {
            // Try to find .ai-test-bot.yml in current directory
            const defaultPath = path.join(process.cwd(), '.ai-test-bot.yml');
            if (await fileExists(defaultPath)) {
                config = await this.loadFromFile(defaultPath);
            }
        }

        // Merge with defaults
        const mergedConfig = this.mergeWithDefaults(config);

        // Override with environment variables
        this.applyEnvironmentOverrides(mergedConfig);

        logger.info('Configuration loaded successfully');
        return mergedConfig;
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
}

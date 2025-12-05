/**
 * Auto-fix configuration
 */
export interface AutoFixConfig {
    enabled: boolean;
    install_dependencies: boolean;
    update_test_config: boolean;
    create_virtualenv: boolean;
    max_commands_per_project: number;
}

/**
 * Configuration schema for the test bot
 */
export interface BotConfig {
    enabled_tests: {
        unit: boolean;
        integration: boolean;
        e2e: boolean;
    };
    auto_fix: AutoFixConfig;
    coverage: {
        threshold: number;
        prioritize_critical_paths: boolean;
        max_refinement_iterations: number;
    };
    exclude_patterns: string[];
    llm: {
        provider: 'openai' | 'claude' | 'gemini' | 'local' | 'openrouter';
        model: string; // Default/fallback model
        mode?: 'balanced' | 'cheap' | 'premium';
        models?: {
            planner?: string;      // High-level analysis & strategy
            coder?: string;        // Main code generation
            long_context?: string; // Large context windows
            helper?: string;       // Quick transformations
        };
        api_key?: string;
        max_tokens: number;
        temperature: number;
        timeout: number;
        max_tokens_per_run?: number;
        token_budget_warn_threshold?: number;
    };
    git: {
        enabled: boolean;
        auto_push: boolean;
        create_pr: boolean;
        branch_prefix: string;
    };
    adapters: {
        node: boolean;
        python: boolean;
        java: boolean;
        dotnet: boolean;
        go: boolean;
        php: boolean;
    };
    execution: {
        timeout: number;
        parallel: boolean;
        retry_failed: boolean;
    };
    output: {
        format: ('json' | 'html')[];
        artifacts_dir: string;
        verbose: boolean;
    };
    refinement?: {
        max_iterations: number;
    };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: BotConfig = {
    enabled_tests: {
        unit: true,
        integration: true,
        e2e: true,
    },
    auto_fix: {
        enabled: true,
        install_dependencies: true,
        update_test_config: true,
        create_virtualenv: true,
        max_commands_per_project: 10,
    },
    coverage: {
        threshold: 80,
        prioritize_critical_paths: true,
        max_refinement_iterations: 3,
    },
    exclude_patterns: [
        '**/node_modules/**',
        '**/vendor/**',
        '**/dist/**',
        '**/build/**',
        '**/target/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/__tests__/**',
        '**/tests/**',
    ],
    llm: {
        provider: 'openrouter',
        model: '', // Must be set via OPENROUTER_MODEL env var
        mode: 'balanced',
        models: {
            planner: '',         // Must be set via LLM_MODEL_PLANNER env var
            coder: '',           // Must be set via LLM_MODEL_CODER env var
            long_context: '',    // Must be set via LLM_MODEL_LONG_CONTEXT env var
            helper: '',          // Must be set via LLM_MODEL_HELPER env var
        },
        max_tokens: 4000,
        temperature: 0.2,
        timeout: 60000,
        max_tokens_per_run: 1000000,
        token_budget_warn_threshold: 0.8,
    },
    git: {
        enabled: false,
        auto_push: false,
        create_pr: false,
        branch_prefix: 'ai-tests',
    },
    adapters: {
        node: true,
        python: true,
        java: true,
        dotnet: false,
        go: false,
        php: false,
    },
    execution: {
        timeout: 300000,
        parallel: false,
        retry_failed: true,
    },
    output: {
        format: ['json', 'html'],
        artifacts_dir: './artifacts',
        verbose: false,
    },
};

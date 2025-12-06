import { BotConfig } from '../config/schema';

/**
 * Print comprehensive startup diagnostics for debugging config issues
 */
export function printStartupDiagnostics(config: BotConfig, options: any): void {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 STARTUP DIAGNOSTICS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Config sources
    console.log('📁 Config Sources:');
    console.log(`   Repository Config: ${options.config || 'default (.ai-test-bot.yml)'}`);
    console.log(`   CLI Overrides: ${Object.keys(options).filter(k => k !== 'config').length} applied\n`);

    // LLM Configuration
    console.log('🧠 LLM Configuration:');
    console.log(`   Provider: ${config.llm.provider}`);
    console.log(`   Mode: ${config.llm.mode || 'balanced'}`);
    console.log(`   API Key Present: ✅ ${process.env.OPENROUTER_API_KEY ? 'YES' : '❌ NO'}\n`);

    // Resolved Models
    console.log('🎯 Resolved Model IDs:');
    const planner = config.llm.models?.planner || process.env.LLM_MODEL_PLANNER || 'NOT SET';
    const coder = config.llm.models?.coder || process.env.LLM_MODEL_CODER || config.llm.model || 'NOT SET';
    const longContext = config.llm.models?.long_context || process.env.LLM_MODEL_LONG_CONTEXT || 'NOT SET';
    const helper = config.llm.models?.helper || process.env.LLM_MODEL_HELPER || 'NOT SET';
    const fallback = process.env.OPENROUTER_MODEL || config.llm.model || 'NOT SET';
    const secondaryFallback = process.env.OPENROUTER_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct';

    console.log(`   Planner: ${planner}`);
    console.log(`   Coder: ${coder}`);
    console.log(`   Long Context: ${longContext}`);
    console.log(`   Helper: ${helper}`);
    console.log(`   Primary Fallback: ${fallback}`);
    console.log(`   Secondary Fallback: ${secondaryFallback}\n`);

    // Validate no free models
    const models = [planner, coder, longContext, helper, fallback, secondaryFallback];
    const freeModels = models.filter(m => m && m.endsWith(':free'));
    if (freeModels.length > 0) {
        console.log('⚠️  WARNING: Free models detected (may have rate limits):');
        freeModels.forEach(m => console.log(`   - ${m}`));
        console.log('   Consider switching to paid models for reliability.\n');
    }

    // Test Configuration
    console.log('🧪 Test Configuration:');
    console.log(`   Unit Tests: ${config.enabled_tests.unit ? '✅' : '❌'}`);
    console.log(`   Integration Tests: ${config.enabled_tests.integration ? '✅' : '❌'}`);
    console.log(`   E2E Tests: ${config.enabled_tests.e2e ? '✅' : '❌'}`);
    console.log(`   Coverage Threshold: ${config.coverage.threshold}%`);
    console.log(`   Auto-Fix: ${config.auto_fix.enabled ? '✅ Enabled' : '❌ Disabled'}\n`);

    // Execution
    console.log('⚙️  Execution Settings:');
    console.log(`   Timeout: ${config.execution.timeout}ms`);
    console.log(`   Parallel: ${config.execution.parallel ? 'Yes' : 'No'}`);
    console.log(`   Max Refinement Iterations: ${config.coverage.max_refinement_iterations}\n`);

    console.log('═══════════════════════════════════════════════════════════\n');
}

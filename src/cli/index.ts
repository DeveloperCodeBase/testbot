#!/usr/bin/env node

import { Command } from 'commander';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { JobOrchestrator } from '../orchestrator/JobOrchestrator.js';
import { ReportGenerator } from '../reporter/ReportGenerator.js';
import logger from '../utils/logger.js';
import { BotConfig } from '../config/schema.js';
import path from 'path';

const program = new Command();

program
    .name('testbot')
    .description('Autonomous multi-language AI test bot')
    .version('1.0.0');

program
    .command('analyze')
    .description('Analyze a repository and generate tests')
    .argument('<repo>', 'Repository URL or local path')
    .option('-c, --config <path>', 'Custom config file')
    .option('-o, --output <dir>', 'Output directory', './artifacts')
    .option('--no-unit', 'Skip unit tests')
    .option('--no-integration', 'Skip integration tests')
    .option('--no-e2e', 'Skip E2E tests')
    .option('--coverage-threshold <number>', 'Coverage threshold', '80')
    .option('--git-push', 'Push to remote branch')
    .option('--auto-fix', 'Enable all auto-fix features')
    .option('--no-auto-fix', 'Disable all auto-fix features')
    .option('--auto-fix-deps-only', 'Only auto-fix dependencies')
    .option('--auto-fix-config-only', 'Only auto-fix configuration')
    .option('-v, --verbose', 'Verbose output')
    .action(async (repo: string, options: any) => {
        try {
            logger.info('Starting test bot...');

            // Load configuration
            const configLoader = new ConfigLoader();
            let config = await configLoader.load(options.config);

            // Apply CLI options
            config = applyCliOptions(config, options);

            // Execute job
            const orchestrator = new JobOrchestrator(config);
            const result = await orchestrator.execute(repo);

            // Generate reports
            const outputDir = path.resolve(options.output, result.jobId);
            const reportGenerator = new ReportGenerator();
            const reports = await reportGenerator.generateReports(
                result,
                outputDir,
                config.output.format as ('json' | 'html')[]
            );

            // Print summary
            console.log('\n=== Test Bot Results ===');
            console.log(`Status: ${result.status}`);
            console.log(`Projects: ${result.summary.totalProjects}`);
            console.log(`Total Tests: ${result.summary.totalTests}`);
            console.log(`Passed: ${result.summary.passedTests}`);
            console.log(`Failed: ${result.summary.failedTests}`);
            console.log(`Generated Files: ${result.generatedTestFiles.length}`);
            console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

            if (reports.jsonPath) {
                console.log(`\nJSON Report: ${reports.jsonPath}`);
            }
            if (reports.htmlPath) {
                console.log(`HTML Report: ${reports.htmlPath}`);
            }

            if (result.status === 'failed') {
                console.error('\nErrors:');
                result.errors.forEach(err => console.error(`- ${err}`));
                process.exit(1);
            }

            logger.info('Test bot completed successfully');
        } catch (error) {
            logger.error(`Test bot failed: ${error}`);
            console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    });

/**
 * Apply CLI options to config
 */
function applyCliOptions(config: BotConfig, options: any): BotConfig {
    if (options.unit === false) {
        config.enabled_tests.unit = false;
    }
    if (options.integration === false) {
        config.enabled_tests.integration = false;
    }
    if (options.e2e === false) {
        config.enabled_tests.e2e = false;
    }
    if (options.coverageThreshold) {
        config.coverage.threshold = parseInt(options.coverageThreshold);
    }
    if (options.gitPush) {
        config.git.enabled = true;
        config.git.auto_push = true;
    }
    if (options.verbose) {
        config.output.verbose = true;
    }
    if (options.output) {
        config.output.artifacts_dir = options.output;
    }

    // Auto-fix options
    if (options.autoFix !== undefined) {
        config.auto_fix.enabled = options.autoFix;
    }
    if (options.autoFix === false) {
        // Explicitly disabled
        config.auto_fix.enabled = false;
    } else if (options.autoFix === true) {
        // Explicitly enabled
        config.auto_fix.enabled = true;
        config.auto_fix.install_dependencies = true;
        config.auto_fix.update_test_config = true;
        config.auto_fix.create_virtualenv = true;
    }

    if (options.autoFixDepsOnly) {
        config.auto_fix.enabled = true;
        config.auto_fix.install_dependencies = true;
        config.auto_fix.update_test_config = false;
        config.auto_fix.create_virtualenv = false;
    }

    if (options.autoFixConfigOnly) {
        config.auto_fix.enabled = true;
        config.auto_fix.install_dependencies = false;
        config.auto_fix.update_test_config = true;
        config.auto_fix.create_virtualenv = false;
    }

    return config;
}

program.parse();

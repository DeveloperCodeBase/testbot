import { ConfigLoader } from './config/ConfigLoader.js';
import { JobOrchestrator } from './orchestrator/JobOrchestrator.js';
import { ReportGenerator } from './reporter/ReportGenerator.js';
import logger from './utils/logger.js';
require('dotenv').config();
/**
 * Main entry point for programmatic usage
 */
export async function runTestBot(repoInput: string, configPath?: string) {
    try {
        logger.info('Starting test bot...');

        // Load configuration
        const configLoader = new ConfigLoader();
        const config = await configLoader.load(configPath);

        // Execute job
        const orchestrator = new JobOrchestrator(config);
        const result = await orchestrator.execute(repoInput);

        // Generate reports
        const reportGenerator = new ReportGenerator();
        const outputDir = `${config.output.artifacts_dir}/${result.jobId}`;
        const reports = await reportGenerator.generateReports(
            result,
            outputDir,
            config.output.format as ('json' | 'html')[]
        );

        logger.info('Test bot completed successfully');

        return {
            result,
            reports,
        };
    } catch (error) {
        logger.error(`Test bot failed: ${error}`);
        throw error;
    }
}

// Export main components for library usage
export { ConfigLoader } from './config/ConfigLoader.js';
export { JobOrchestrator } from './orchestrator/JobOrchestrator.js';
export { ReportGenerator } from './reporter/ReportGenerator.js';
export * from './models/ProjectDescriptor.js';
export * from './models/ArchitectureModel.js';
export * from './models/TestRunResult.js';
export * from './models/CoverageReport.js';
export * from './config/schema.js';

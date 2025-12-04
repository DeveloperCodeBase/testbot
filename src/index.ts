import { ConfigLoader } from './config/ConfigLoader';
import { JobOrchestrator } from './orchestrator/JobOrchestrator';
import { ReportGenerator } from './reporter/ReportGenerator';
import logger from './utils/logger';
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
export { ConfigLoader } from './config/ConfigLoader';
export { JobOrchestrator } from './orchestrator/JobOrchestrator';
export { ReportGenerator } from './reporter/ReportGenerator';
export * from './models/ProjectDescriptor';
export * from './models/ArchitectureModel';
export * from './models/TestRunResult';
export * from './models/CoverageReport';
export * from './config/schema';

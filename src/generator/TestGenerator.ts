import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { ArchitectureModel } from '../models/ArchitectureModel.js';
import { UnitTestGenerator } from './UnitTestGenerator.js';
import { IntegrationTestGenerator } from './IntegrationTestGenerator.js';
import { E2ETestGenerator } from './E2ETestGenerator.js';
import { BotConfig } from '../config/schema.js';
import logger from '../utils/logger.js';

/**
 * Coordinates all test generation
 */
export class TestGenerator {
    private unitTestGenerator: UnitTestGenerator;
    private integrationTestGenerator: IntegrationTestGenerator;
    private e2eTestGenerator: E2ETestGenerator;
    private config: BotConfig;

    constructor(config: BotConfig) {
        this.config = config;
        this.unitTestGenerator = new UnitTestGenerator(config);
        this.integrationTestGenerator = new IntegrationTestGenerator(config);
        this.e2eTestGenerator = new E2ETestGenerator(config);
    }

    /**
     * Generate all tests for a project
     */
    async generateAllTests(
        project: ProjectDescriptor,
        projectPath: string,
        architecture?: ArchitectureModel
    ): Promise<{ unit: string[]; integration: string[]; e2e: string[]; errors: string[] }> {
        logger.info(`Generating tests for project: ${project.name}`);

        const results = {
            unit: [] as string[],
            integration: [] as string[],
            e2e: [] as string[],
            errors: [] as string[],
        };

        // Generate unit tests
        if (this.config.enabled_tests.unit) {
            try {
                results.unit = await this.unitTestGenerator.generateTests(project, projectPath, architecture);
                logger.info(`Generated ${results.unit.length} unit test files`);
            } catch (error) {
                const errorMsg = `Failed to generate unit tests for ${project.name}: ${error}`;
                logger.error(errorMsg);
                results.errors.push(errorMsg);
            }
        }

        // Generate integration tests
        if (this.config.enabled_tests.integration) {
            try {
                results.integration = await this.integrationTestGenerator.generateTests(project, projectPath, architecture);
                logger.info(`Generated ${results.integration.length} integration test files`);
            } catch (error) {
                const errorMsg = `Failed to generate integration tests for ${project.name}: ${error}`;
                logger.error(errorMsg);
                results.errors.push(errorMsg);
            }
        }

        // Generate E2E tests
        if (this.config.enabled_tests.e2e) {
            try {
                results.e2e = await this.e2eTestGenerator.generateTests(project, projectPath, architecture);
                logger.info(`Generated ${results.e2e.length} E2E test files`);
            } catch (error) {
                const errorMsg = `Failed to generate E2E tests for ${project.name}: ${error}`;
                logger.error(errorMsg);
                results.errors.push(errorMsg);
            }
        }

        const totalTests = results.unit.length + results.integration.length + results.e2e.length;
        logger.info(`Generated total ${totalTests} test files for ${project.name}`);

        return results;
    }
}

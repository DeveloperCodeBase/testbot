import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { ArchitectureModel } from '../models/ArchitectureModel';
import { UnitTestGenerator } from './UnitTestGenerator';
import { IntegrationTestGenerator } from './IntegrationTestGenerator';
import { E2ETestGenerator } from './E2ETestGenerator';
import { CSharpTestGenerator } from './CSharpTestGenerator';
import { BotConfig } from '../config/schema';
import logger from '../utils/logger';

/**
 * Coordinates all test generation
 */
export class TestGenerator {
    private unitTestGenerator: UnitTestGenerator;
    private integrationTestGenerator: IntegrationTestGenerator;
    private e2eTestGenerator: E2ETestGenerator;
    private csharpTestGenerator: CSharpTestGenerator;
    private config: BotConfig;

    constructor(config: BotConfig) {
        this.config = config;
        this.unitTestGenerator = new UnitTestGenerator(config);
        this.integrationTestGenerator = new IntegrationTestGenerator(config);
        this.e2eTestGenerator = new E2ETestGenerator(config);
        this.csharpTestGenerator = new CSharpTestGenerator(config);
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
                // Use C# specific generator for C# projects
                if (project.language === 'csharp' || project.language === 'c#') {
                    results.unit = await this.csharpTestGenerator.generateTests(project, projectPath, architecture);
                } else {
                    results.unit = await this.unitTestGenerator.generateTests(project, projectPath, architecture);
                }
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
    /**
     * Generate targeted tests for specific files
     */
    async generateTargetedTests(
        project: ProjectDescriptor,
        projectPath: string,
        filesToCover: { path: string; instructions: string }[]
    ): Promise<string[]> {
        // Use C# specific generator for C# projects
        if (project.language === 'csharp' || project.language === 'c#') {
            return await this.csharpTestGenerator.generateTestsForFiles(project, projectPath, filesToCover);
        }
        return await this.unitTestGenerator.generateTestsForFiles(project, projectPath, filesToCover);
    }

    /**
     * Generate minimal tests for a project to ensure coverage collection
     */
    async generateMinimalTests(
        project: ProjectDescriptor,
        projectPath: string,
        type: 'integration' | 'e2e'
    ): Promise<string[]> {
        logger.info(`Generating minimal ${type} tests for ${project.name}`);

        // Delegate to appropriate generator
        if (type === 'integration') {
            return await this.integrationTestGenerator.generateMinimalTests(project, projectPath);
        } else {
            return await this.e2eTestGenerator.generateMinimalTests(project, projectPath);
        }
    }

    /**
     * Get aggregated LLM usage statistics from all generators
     */
    getLLMUsageStats() {
        const allStats = [
            ...this.unitTestGenerator['llmOrchestrator'].getUsageStats(),
            ...this.integrationTestGenerator['llmOrchestrator'].getUsageStats(),
            ...this.e2eTestGenerator['llmOrchestrator'].getUsageStats(),
            ...this.csharpTestGenerator['llmOrchestrator'].getUsageStats(),
        ];

        const totalTokens = allStats.reduce((sum, stat) => sum + stat.tokensEstimated, 0);

        return {
            stats: allStats,
            totalTokens
        };
    }
}

import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { ArchitectureModel } from '../models/ArchitectureModel';
import { UnitTestGenerator } from './UnitTestGenerator';
import { IntegrationTestGenerator } from './IntegrationTestGenerator';
import { E2ETestGenerator } from './E2ETestGenerator';
import { CSharpTestGenerator } from './CSharpTestGenerator';
import { BotConfig } from '../config/schema';
import logger from '../utils/logger';
import path from 'path';
import { ImportSanityGate } from '../validator/ImportSanityGate';
import { writeFile, readFile } from '../utils/fileUtils';

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

                // Validate and fix imports, track skipped files
                const { written, skipped } = await this.validateAndFixTests(results.unit, projectPath);
                results.unit = written;

                // Add skipped files to errors
                skipped.forEach(s => {
                    results.errors.push(`GENERATION_IMPORT_UNRESOLVABLE: ${path.basename(s.path)} - ${s.reason}`);
                });

                logger.info(`Generated ${results.unit.length} unit test files (${skipped.length} skipped)`);
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

                // Validate and fix imports, track skipped files
                const { written, skipped } = await this.validateAndFixTests(results.integration, projectPath);
                results.integration = written;

                // Add skipped files to errors
                skipped.forEach(s => {
                    results.errors.push(`GENERATION_IMPORT_UNRESOLVABLE: ${path.basename(s.path)} - ${s.reason}`);
                });

                logger.info(`Generated ${results.integration.length} integration test files (${skipped.length} skipped)`);
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

                // Validate and fix imports, track skipped files
                const { written, skipped } = await this.validateAndFixTests(results.e2e, projectPath);
                results.e2e = written;

                // Add skipped files to errors
                skipped.forEach(s => {
                    results.errors.push(`GENERATION_IMPORT_UNRESOLVABLE: ${path.basename(s.path)} - ${s.reason}`);
                });

                logger.info(`Generated ${results.e2e.length} E2E test files (${skipped.length} skipped)`);
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

    /**
     * Get aggregated fallback events
     */
    getFallbackEvents() {
        return [
            ...this.unitTestGenerator.getFallbackEvents(),
            ...this.integrationTestGenerator.getFallbackEvents(),
            ...this.e2eTestGenerator.getFallbackEvents(),
            // CSharp generator might not have it yet, but let's assume it does or skip it for now
            // ...this.csharpTestGenerator.getFallbackEvents(), 
        ];
    }
    /**
     * Validate and fix imports in generated tests
     * Returns { written, skipped } to track which files were skipped
     */
    private async validateAndFixTests(
        filePaths: string[],
        projectPath: string
    ): Promise<{ written: string[]; skipped: Array<{ path: string; reason: string }> }> {
        if (!filePaths || filePaths.length === 0) {
            return { written: [], skipped: [] };
        }

        logger.info(`Validating imports for ${filePaths.length} generated files...`);

        const written: string[] = [];
        const skipped: Array<{ path: string; reason: string }> = [];

        for (const filePath of filePaths) {
            try {
                const content = await readFile(filePath);
                const result = await ImportSanityGate.validateOrSkip(filePath, content, projectPath);

                if (!result.shouldWrite) {
                    // Skip this file - delete it and track the reason
                    logger.warn(`⚠️  Skipping ${path.basename(filePath)}: ${result.skippedReason}`);
                    skipped.push({ path: filePath, reason: result.skippedReason! });

                    // Delete the file since it won't work
                    const fs = await import('fs/promises');
                    await fs.unlink(filePath);
                } else if (result.fixedContent) {
                    // Write fixed content
                    await writeFile(filePath, result.fixedContent);
                    written.push(filePath);
                    logger.info(`✅ Fixed and wrote ${path.basename(filePath)}`);
                } else {
                    // File is valid as-is
                    written.push(filePath);
                }
            } catch (error) {
                logger.warn(`Failed to validate/fix imports for ${filePath}: ${error}`);
                // Keep the file if validation fails
                written.push(filePath);
            }
        }

        if (skipped.length > 0) {
            logger.warn(`⚠️  Skipped ${skipped.length} file(s) due to unresolvable imports`);
        }

        return { written, skipped };
    }
}

import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { ArchitectureModel } from '../models/ArchitectureModel';
import { LLMOrchestrator, LLMRequest } from '../llm/LLMOrchestrator';
import { AdapterRegistry } from '../adapters/AdapterRegistry';
import { BotConfig } from '../config/schema';
import { writeFile, readFile, findSourceFiles as findSourceFilesUtil } from '../utils/fileUtils';
import logger from '../utils/logger';
import path from 'path';
import { PathNormalizer } from '../utils/PathNormalizer';
import { ImportSanityGate } from '../validator/ImportSanityGate';
import { TestQualityGate } from '../validator/TestQualityGate';
import { JobIssue } from '../models/TestRunResult';

/**
 * Generates unit tests for source files
 */
export class UnitTestGenerator {
    private llmOrchestrator: LLMOrchestrator;
    private adapterRegistry: AdapterRegistry;
    private importIssues: JobIssue[] = [];

    constructor(config: BotConfig) {
        this.llmOrchestrator = new LLMOrchestrator(config.llm);
        this.adapterRegistry = new AdapterRegistry();
    }

    /**
     * Generate unit tests for a project
     */
    async generateTests(
        project: ProjectDescriptor,
        projectPath: string,
        architecture?: ArchitectureModel
    ): Promise<string[]> {
        logger.info(`Generating unit tests for project: ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) {
            logger.warn(`No adapter for project ${project.name}, skipping unit tests`);
            return [];
        }

        const generatedFiles: string[] = [];

        // Find source files that need tests
        const sourceFiles = await this.findSourceFiles(projectPath, project);

        // Generate tests in batches to manage token limits
        const batchSize = 3;
        for (let i = 0; i < sourceFiles.length; i += batchSize) {
            const batch = sourceFiles.slice(i, i + batchSize);

            try {
                const files = await Promise.all(
                    batch.map(async (file) => ({
                        path: file,
                        content: await readFile(path.join(projectPath, file)),
                    }))
                );

                const request: LLMRequest = {
                    role: 'unit',
                    language: project.language,
                    framework: project.framework,
                    testFramework: adapter.getTestFramework(project),
                    files,
                    projectSummary: this.createProjectSummary(project),
                    architectureSummary: architecture ? this.createArchitectureSummary(architecture) : undefined,
                };

                const response = await this.llmOrchestrator.generateTests(request);

                // Write generated test files
                for (const [filename, content] of Object.entries(response.generatedFiles)) {
                    let testPath;
                    if (filename === 'generated_test') {
                        // Use adapter to determine test path
                        const relativeTestPath = adapter.getTestFilePath(batch[0], 'unit', project);
                        testPath = PathNormalizer.normalizeFilePath(projectPath, relativeTestPath);
                    } else {
                        // Normalize filename: strip project name prefix if present
                        const normalizedFilename = this.normalizeFilename(filename, project.name);
                        testPath = PathNormalizer.normalizeFilePath(projectPath, normalizedFilename);
                    }

                    // Validate imports before writing
                    const validation = await ImportSanityGate.validateOrSkip(testPath, content, projectPath);
                    if (!validation.shouldWrite) {
                        logger.warn(`Skipping ${testPath}: ${validation.skippedReason}`);
                        this.importIssues.push({
                            project: project.name,
                            stage: 'generate',
                            kind: 'GENERATION_IMPORT_UNRESOLVABLE',
                            severity: 'warning',
                            message: `Skipped unit test generation: ${validation.skippedReason}`,
                            suggestion: 'Review import paths in generated test or fix source file structure',
                            details: validation.issues.join('; ')
                        });
                        continue;
                    }

                    await writeFile(testPath, validation.fixedContent || content);

                    // Quality Gate Check
                    const qualityResult = await TestQualityGate.checkGeneratedTest(testPath, projectPath);
                    if (!qualityResult.passed && !qualityResult.fixed) {
                        this.importIssues.push({
                            project: project.name,
                            stage: 'generate',
                            kind: qualityResult.quarantined ? 'TEST_QUARANTINED' : 'TEST_QUALITY_GATE_FAILED',
                            severity: 'warning',
                            message: qualityResult.quarantined ? `Test quarantined due to errors: ${testPath}` : `Test quality gate failed: ${testPath}`,
                            suggestion: 'Fix TypeScript errors in generated test or review source types',
                            details: qualityResult.issues.join('; ')
                        });

                        // If quarantined, do not include in generated list (it is moved)
                        if (qualityResult.quarantined) {
                            continue;
                        }
                    }

                    generatedFiles.push(testPath);
                    logger.info(`Generated unit test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate unit tests for batch: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Generate unit tests for specific files with instructions
     */
    async generateTestsForFiles(
        project: ProjectDescriptor,
        projectPath: string,
        filesToCover: { path: string; instructions: string }[]
    ): Promise<string[]> {
        logger.info(`Generating targeted unit tests for ${filesToCover.length} files in ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) return [];

        const generatedFiles: string[] = [];
        const batchSize = 3;

        for (let i = 0; i < filesToCover.length; i += batchSize) {
            const batch = filesToCover.slice(i, i + batchSize);

            try {
                const files = await Promise.all(
                    batch.map(async (item) => ({
                        path: item.path,
                        content: await readFile(path.join(projectPath, item.path)),
                    }))
                );

                // Combine instructions
                const instructions = batch.map(item => `File ${item.path}: ${item.instructions}`).join('\n');

                const request: LLMRequest = {
                    role: 'unit',
                    language: project.language,
                    framework: project.framework,
                    testFramework: adapter.getTestFramework(project),
                    files,
                    projectSummary: this.createProjectSummary(project),
                    additionalInstructions: `Focus on covering these specific areas:\n${instructions}`
                };

                const response = await this.llmOrchestrator.generateTests(request);

                for (const [filename, content] of Object.entries(response.generatedFiles)) {
                    let testPath;
                    if (filename === 'generated_test') {
                        const relativeTestPath = adapter.getTestFilePath(batch[0].path, 'unit', project);
                        testPath = PathNormalizer.normalizeFilePath(projectPath, relativeTestPath);
                    } else {
                        const normalizedFilename = this.normalizeFilename(filename, project.name);
                        testPath = PathNormalizer.normalizeFilePath(projectPath, normalizedFilename);
                    }

                    // Validate imports before writing
                    const validation = await ImportSanityGate.validateOrSkip(testPath, content, projectPath);
                    if (!validation.shouldWrite) {
                        logger.warn(`Skipping ${testPath}: ${validation.skippedReason}`);
                        this.importIssues.push({
                            project: project.name,
                            stage: 'generate',
                            kind: 'GENERATION_IMPORT_UNRESOLVABLE',
                            severity: 'warning',
                            message: `Skipped targeted unit test: ${validation.skippedReason}`,
                            suggestion: 'Review import paths or fix source file structure',
                            details: validation.issues.join('; ')
                        });
                        continue;
                    }

                    await writeFile(testPath, validation.fixedContent || content);

                    // Quality Gate Check
                    const qualityResult = await TestQualityGate.checkGeneratedTest(testPath, projectPath);
                    if (!qualityResult.passed && !qualityResult.fixed) {
                        this.importIssues.push({
                            project: project.name,
                            stage: 'generate',
                            kind: qualityResult.quarantined ? 'TEST_QUARANTINED' : 'TEST_QUALITY_GATE_FAILED',
                            severity: 'warning',
                            message: qualityResult.quarantined ? `Test quarantined due to errors: ${testPath}` : `Test quality gate failed: ${testPath}`,
                            suggestion: 'Fix TypeScript errors in generated test or review source types',
                            details: qualityResult.issues.join('; ')
                        });

                        if (qualityResult.quarantined) {
                            continue;
                        }
                    }

                    generatedFiles.push(testPath);
                    logger.info(`Generated targeted unit test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate targeted tests: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Find source files that need tests
     */
    private async findSourceFiles(projectPath: string, project: ProjectDescriptor): Promise<string[]> {
        logger.info(`Finding source files in ${projectPath} for language: ${project.language}`);

        // Use glob-based discovery
        const sourceFiles = await findSourceFilesUtil(projectPath, project.language, []);

        logger.info(`Found ${sourceFiles.length} source files`);

        // Convert to relative paths and limit to reasonable batch size
        const relativeFiles = sourceFiles
            .map(f => path.relative(projectPath, f))
            .filter(f => {
                // Additional filtering: skip entry-point-like files if they're too large
                // Focus on actual implementation files
                return !f.includes('node_modules') && !f.includes('dist');
            })
            .slice(0, 10); // Limit to 10 files for demo

        logger.info(`Selected ${relativeFiles.length} files for test generation`);
        return relativeFiles;
    }

    /**
     * Create project summary
     */
    private createProjectSummary(project: ProjectDescriptor): string {
        return `Project: ${project.name}
Language: ${project.language}
Framework: ${project.framework || 'None'}
Build Tool: ${project.buildTool || 'None'}`;
    }

    /**
     * Create architecture summary
     */
    private createArchitectureSummary(architecture: ArchitectureModel): string {
        const components = architecture.components.slice(0, 10).map(c => `- ${c.name} (${c.type})`).join('\n');
        return `Architecture:\n${components}\n\nCritical Domains: ${architecture.criticalDomains.join(', ')}`;
    }

    /**
     * Normalize filename to prevent double project name nesting
     * Strips project name prefix if present (e.g., 'backend-node/file.test.ts' => 'file.test.ts')
     */
    private normalizeFilename(filename: string, projectName: string): string {
        // Remove any leading project name directory
        const segments = filename.split(path.sep);
        if (segments.length > 1 && segments[0] === projectName) {
            return segments.slice(1).join(path.sep);
        }
        return filename;
    }

    /**
     * Get fallback events
     */
    getFallbackEvents() {
        return this.llmOrchestrator.getFallbackEvents();
    }

    /**
     * Get import issues found during generation
     */
    getImportIssues(): JobIssue[] {
        return this.importIssues;
    }
}

import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { ArchitectureModel } from '../models/ArchitectureModel';
import { LLMOrchestrator, LLMRequest } from '../llm/LLMOrchestrator';
import { AdapterRegistry } from '../adapters/AdapterRegistry';
import { BotConfig } from '../config/schema';
import { writeFile, readFile, fileExists, findSourceFiles as findSourceFilesUtil } from '../utils/fileUtils';
import logger from '../utils/logger';
import path from 'path';

/**
 * Generates integration tests for services and APIs
 */
export class IntegrationTestGenerator {
    private llmOrchestrator: LLMOrchestrator;
    private adapterRegistry: AdapterRegistry;

    constructor(config: BotConfig) {
        this.llmOrchestrator = new LLMOrchestrator(config.llm);
        this.adapterRegistry = new AdapterRegistry();
    }

    /**
     * Generate integration tests for a project
     */
    async generateTests(
        project: ProjectDescriptor,
        projectPath: string,
        architecture?: ArchitectureModel
    ): Promise<string[]> {
        logger.info(`Generating integration tests for project: ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) {
            logger.warn(`No adapter for project ${project.name}, skipping integration tests`);
            return [];
        }

        const generatedFiles: string[] = [];

        // Get integration test candidates
        let candidates: Array<{ path: string; name: string; type: string }> = [];

        if (architecture) {
            // Use architecture model if available
            candidates = architecture.components
                .filter(c => c.type === 'controller' || c.type === 'service')
                .slice(0, 5) // Limit to 5 for demo
                .map(c => ({ path: c.path, name: c.name, type: c.type }));
        } else {
            // Fallback: discover files by naming convention
            logger.info('No architecture model provided, using file discovery fallback');
            const sourceFiles = await findSourceFilesUtil(projectPath, project.language, []);

            // Look for files with controller, service, or API in their name
            candidates = sourceFiles
                .filter(file => {
                    const basename = path.basename(file).toLowerCase();
                    return basename.includes('controller') ||
                        basename.includes('service') ||
                        basename.includes('api') ||
                        basename.includes('route');
                })
                .slice(0, 5)
                .map(file => ({
                    path: file,
                    name: path.basename(file, path.extname(file)),
                    type: 'component',
                }));

            logger.info(`Found ${candidates.length} integration test candidates via file discovery`);
        }

        for (const candidate of candidates) {
            try {
                const exists = await fileExists(candidate.path);
                if (!exists) {
                    logger.warn(`Candidate file not found: ${candidate.path}`);
                    continue;
                }

                const content = await readFile(candidate.path);

                const request: LLMRequest = {
                    role: 'integration',
                    language: project.language,
                    framework: project.framework,
                    testFramework: adapter.getTestFramework(project),
                    files: [{ path: candidate.path, content }],
                    projectSummary: this.createProjectSummary(project),
                    architectureSummary: architecture ? this.createArchitectureSummary(architecture) : undefined,
                    extraContext: architecture
                        ? this.createIntegrationContext(candidate, architecture)
                        : `Component: ${candidate.name}\nTest focus: API endpoints, service interactions, database operations`,
                };

                const response = await this.llmOrchestrator.generateTests(request);

                // Write generated test files
                for (const [filename, testContent] of Object.entries(response.generatedFiles)) {
                    let testPath;
                    if (filename === 'generated_test') {
                        const relativeTestPath = adapter.getTestFilePath(candidate.path, 'integration', project);
                        testPath = path.join(projectPath, relativeTestPath);
                    } else {
                        // Normalize filename: strip project name prefix if present
                        const normalizedFilename = this.normalizeFilename(filename, project.name);
                        testPath = path.join(projectPath, normalizedFilename);
                    }

                    await writeFile(testPath, testContent);
                    generatedFiles.push(testPath);
                    logger.info(`Generated integration test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate integration test for ${candidate.name}: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Create project summary
     */
    private createProjectSummary(project: ProjectDescriptor): string {
        return `Project: ${project.name}
Language: ${project.language}
Framework: ${project.framework || 'None'}`;
    }

    /**
     * Create architecture summary
     */
    private createArchitectureSummary(architecture: ArchitectureModel): string {
        const endpoints = architecture.apiEndpoints.slice(0, 10).map(e => `- ${e.method} ${e.path}`).join('\n');
        return `API Endpoints:\n${endpoints}`;
    }

    /**
     * Create integration context
     */
    private createIntegrationContext(component: any, _architecture: ArchitectureModel): string {
        const dependencies = component.dependencies.join(', ');
        return `Component: ${component.name} (${component.type})
Dependencies: ${dependencies}
Test focus: API endpoints, service interactions, database operations`;
    }

    /**
     * Normalize filename to prevent double project name nesting
     * Strips project name prefix if present (eg., 'backend-node/file.test.ts' => 'file.test.ts')
     */
    private normalizeFilename(filename: string, projectName: string): string {
        // Remove any leading project name directory
        const segments = filename.split(path.sep);
        if (segments.length > 1 && segments[0] === projectName) {
            return segments.slice(1).join(path.sep);
        }
        return filename;
    }
}

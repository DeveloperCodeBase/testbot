import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { ArchitectureModel } from '../models/ArchitectureModel.js';
import { LLMOrchestrator, LLMRequest } from '../llm/LLMOrchestrator.js';
import { AdapterRegistry } from '../adapters/AdapterRegistry.js';
import { BotConfig } from '../config/schema.js';
import { writeFile } from '../utils/fileUtils.js';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * Generates end-to-end tests for user flows
 */
export class E2ETestGenerator {
    private llmOrchestrator: LLMOrchestrator;
    private adapterRegistry: AdapterRegistry;

    constructor(config: BotConfig) {
        this.llmOrchestrator = new LLMOrchestrator(config.llm);
        this.adapterRegistry = new AdapterRegistry();
    }

    /**
     * Generate E2E tests for a project
     */
    async generateTests(
        project: ProjectDescriptor,
        projectPath: string,
        architecture?: ArchitectureModel
    ): Promise<string[]> {
        logger.info(`Generating E2E tests for project: ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) {
            logger.warn(`No adapter for project ${project.name}, skipping E2E tests`);
            return [];
        }

        const generatedFiles: string[] = [];

        // Generate E2E tests based on user flows or fallback to basic scenarios
        let flows: Array<{ name: string; description?: string; steps?: string[]; endpoints?: string[] }> = [];

        if (architecture && architecture.userFlows && architecture.userFlows.length > 0) {
            // Use architecture user flows if available
            flows = architecture.userFlows.slice(0, 3); // Limit to 3 flows
        } else {
            // Fallback: generate basic E2E tests based on project type
            logger.info('No architecture/userFlows provided, generating basic E2E tests');

            if (project.language === 'typescript' || project.language === 'javascript') {
                if (project.framework && (project.framework.includes('react') || project.framework.includes('vue') || project.framework.includes('angular'))) {
                    // Frontend E2E test
                    flows.push({
                        name: 'app-loads',
                        description: 'Verify the application loads and renders correctly',
                        steps: ['Open application', 'Verify page loads', 'Check main elements are visible'],
                        endpoints: [],
                    });
                } else {
                    // Backend API E2E test
                    flows.push({
                        name: 'api-health',
                        description: 'Verify API is accessible and responds correctly',
                        steps: ['Send health check request', 'Verify response', 'Check API endpoints'],
                        endpoints: ['/health', '/api'],
                    });
                }
            } else if (project.language === 'python') {
                flows.push({
                    name: 'api-workflow',
                    description: 'Verify API workflow operates correctly',
                    steps: ['Initialize client', 'Call API endpoints', 'Verify responses'],
                    endpoints: ['/api'],
                });
            } else if (project.language === 'java') {
                flows.push({
                    name: 'service-integration',
                    description: 'Verify service integration operates correctly',
                    steps: ['Initialize service', 'Execute workflow', 'Verify output'],
                    endpoints: [],
                });
            }
        }

        for (const flow of flows) {
            try {
                const request: LLMRequest = {
                    role: 'e2e',
                    language: project.language,
                    framework: project.framework,
                    testFramework: this.getE2ETestFramework(project),
                    files: [],
                    projectSummary: this.createProjectSummary(project),
                    architectureSummary: architecture ? this.createArchitectureSummary(architecture) : undefined,
                    extraContext: this.createE2EContext(flow, architecture),
                };

                const response = await this.llmOrchestrator.generateTests(request);

                // Write generated test files
                for (const [, content] of Object.entries(response.generatedFiles)) {
                    const testDir = adapter.getTestDirectory(project, 'e2e');
                    const filename = `${flow.name.toLowerCase().replace(/\s+/g, '-')}.e2e${this.getTestExtension(project)}`;
                    // Don't include testDir if it's just '.' to avoid issues
                    const testPath = testDir === '.'
                        ? path.join(projectPath, 'tests', 'e2e', filename)
                        : path.join(projectPath, testDir, filename);

                    await writeFile(testPath, content);
                    generatedFiles.push(testPath);
                    logger.info(`Generated E2E test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate E2E test for flow ${flow.name}: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Get E2E test framework
     */
    private getE2ETestFramework(project: ProjectDescriptor): string {
        if (project.language === 'javascript' || project.language === 'typescript') {
            return 'playwright'; // Default to Playwright for Node.js
        }
        return project.testFramework || 'pytest';
    }

    /**
     * Get test file extension
     */
    private getTestExtension(project: ProjectDescriptor): string {
        if (project.language === 'typescript') return '.ts';
        if (project.language === 'javascript') return '.js';
        if (project.language === 'python') return '.py';
        if (project.language === 'java') return '.java';
        return '.test';
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
        const endpoints = architecture.apiEndpoints.map(e => `${e.method} ${e.path}`).join(', ');
        return `API Endpoints: ${endpoints}`;
    }

    /**
     * Create E2E context
     */
    private createE2EContext(flow: any, _architecture?: ArchitectureModel): string {
        const steps = flow.steps ? flow.steps.join('\n') : 'No specific steps provided';
        const endpoints = flow.endpoints ? flow.endpoints.join(', ') : 'N/A';
        const description = flow.description || 'End-to-end test scenario';
        const criticality = flow.criticality || 'medium';

        return `User Flow: ${flow.name}
Description: ${description}
Priority: ${criticality}

Steps:
${steps}

Endpoints involved: ${endpoints}

Test should cover the complete flow end-to-end, including:
- User authentication (if required)
- All intermediate steps
- Expected outcomes
- Error scenarios`;
    }
}

import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { ArchitectureModel } from '../models/ArchitectureModel';
import { LLMOrchestrator, LLMRequest } from '../llm/LLMOrchestrator';
import { AdapterRegistry } from '../adapters/AdapterRegistry';
import { BotConfig } from '../config/schema';
import { writeFile, readFile, findFiles } from '../utils/fileUtils';
import logger from '../utils/logger';
import path from 'path';

/**
 * Generates unit tests for C# (.NET) projects
 *  Supports xUnit, NUnit, and MSTest frameworks
 */
export class CSharpTestGenerator {
    private llmOrchestrator: LLMOrchestrator;
    private adapterRegistry: AdapterRegistry;

    constructor(config: BotConfig) {
        this.llmOrchestrator = new LLMOrchestrator(config.llm);
        this.adapterRegistry = new AdapterRegistry();
    }

    /**
     * Generate unit tests for a C# project
     */
    async generateTests(
        project: ProjectDescriptor,
        projectPath: string,
        architecture?: ArchitectureModel
    ): Promise<string[]> {
        logger.info(`Generating C# unit tests for project: ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) {
            logger.warn(`No adapter for project ${project.name}, skipping C# tests`);
            return [];
        }

        const generatedFiles: string[] = [];

        // Find C# source files
        const sourceFiles = await this.findSourceFiles(projectPath, project);

        // Generate tests in batches
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

                const testFramework = adapter.getTestFramework(project);
                const request: LLMRequest = {
                    role: 'unit',
                    language: 'csharp',
                    framework: project.framework,
                    testFramework,
                    files,
                    projectSummary: this.createProjectSummary(project, testFramework),
                    architectureSummary: architecture ? this.createArchitectureSummary(architecture) : undefined,
                };

                const response = await this.llmOrchestrator.generateTests(request);

                // Write generated test files
                for (const [filename, content] of Object.entries(response.generatedFiles)) {
                    let testPath;
                    if (filename === 'generated_test') {
                        // Use adapter to determine test path
                        const relativeTestPath = adapter.getTestFilePath(batch[0], 'unit', project);
                        testPath = path.join(projectPath, relativeTestPath);
                    } else {
                        // Normalize filename
                        const normalizedFilename = this.normalizeFilename(filename, project.name);
                        testPath = path.join(projectPath, normalizedFilename);
                    }

                    await writeFile(testPath, content);
                    generatedFiles.push(testPath);
                    logger.info(`Generated C# unit test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate C# unit tests for batch: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Generate unit tests for specific files with instructions (for refinement)
     */
    async generateTestsForFiles(
        project: ProjectDescriptor,
        projectPath: string,
        filesToCover: { path: string; instructions: string }[]
    ): Promise<string[]> {
        logger.info(`Generating targeted C# unit tests for ${filesToCover.length} files in ${project.name}`);

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

                const testFramework = adapter.getTestFramework(project);
                const request: LLMRequest = {
                    role: 'unit',
                    language: 'csharp',
                    framework: project.framework,
                    testFramework,
                    files,
                    projectSummary: this.createProjectSummary(project, testFramework),
                    additionalInstructions: `Focus on covering these specific areas:\n${instructions}`
                };

                const response = await this.llmOrchestrator.generateTests(request);

                for (const [filename, content] of Object.entries(response.generatedFiles)) {
                    let testPath;
                    if (filename === 'generated_test') {
                        const relativeTestPath = adapter.getTestFilePath(batch[0].path, 'unit', project);
                        testPath = path.join(projectPath, relativeTestPath);
                    } else {
                        const normalizedFilename = this.normalizeFilename(filename, project.name);
                        testPath = path.join(projectPath, normalizedFilename);
                    }

                    await writeFile(testPath, content);
                    generatedFiles.push(testPath);
                    logger.info(`Generated targeted C# unit test: ${testPath}`);
                }
            } catch (error) {
                logger.error(`Failed to generate targeted C# tests: ${error}`);
            }
        }

        return generatedFiles;
    }

    /**
     * Find C# source files
     */
    private async findSourceFiles(projectPath: string, project: ProjectDescriptor): Promise<string[]> {
        logger.info(`Finding C# source files in ${projectPath} for project: ${project.name}`);

        // Look for .cs files, excluding test files, bin, obj
        const csFiles = await findFiles(projectPath, '**/*.cs', {
            ignore: ['**/bin/**', '**/obj/**', '**/*Tests.cs', '**/*Test.cs', '**/tests/**', '**/Tests/**'],
        });

        logger.info(`Found ${csFiles.length} C# source files for ${project.name}`);

        // Convert to relative paths and limit
        const relativeFiles = csFiles
            .map(f => path.relative(projectPath, f))
            .slice(0, 10); // Limit to 10 files for demo

        logger.info(`Selected ${relativeFiles.length} files for test generation`);
        return relativeFiles;
    }

    /**
     * Create project summary
     */
    private createProjectSummary(project: ProjectDescriptor, testFramework: string): string {
        return `Project: ${project.name}
Language: C# (.NET)
Framework: ${project.framework || 'None'}
Test Framework: ${testFramework}

C# Test Generation Guidelines:
- Follow ${testFramework} conventions and attributes ([Fact], [Test], etc.)
- Use proper C# naming conventions (PascalCase for classes and methods)
- Place test classes in a namespace matching the source namespace + ".Tests"
- For services with dependency injection, use Moq for mocking dependencies
- For controllers, mock ILogger, services, and HttpContext as needed
- Include proper using statements
- Add descriptive test method names (e.g., Method_Scenario_ExpectedBehavior)`;
    }

    /**
     * Create architecture summary
     */
    private createArchitectureSummary(architecture: ArchitectureModel): string {
        const components = architecture.components.slice(0, 10).map(c => `- ${c.name} (${c.type})`).join('\n');
        return `Architecture:\n${components}\n\nCritical Domains: ${architecture.criticalDomains.join(', ')}`;
    }

    /**
     * Normalize filename
     */
    private normalizeFilename(filename: string, _projectName: string): string {
        const segments = filename.split(path.sep);
        if (segments.length > 1 && segments[0] === _projectName) {
            return segments.slice(1).join(path.sep);
        }
        return filename;
    }
}

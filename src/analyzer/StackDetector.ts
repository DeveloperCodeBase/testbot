import path from 'path';
import { fileExists, findFiles, readFile } from '../utils/fileUtils';
import { ProjectDescriptor, RepoAnalysis } from '../models/ProjectDescriptor';
import logger from '../utils/logger';

/**
 * Detects languages, frameworks, and project structure
 */
export class StackDetector {
    private repoPath: string;

    constructor(repoPath: string) {
        this.repoPath = repoPath;
    }

    /**
     * Analyze the repository and detect all projects
     */
    async analyze(): Promise<RepoAnalysis> {
        logger.info('Starting stack detection...');

        const projects: ProjectDescriptor[] = [];
        const languages = new Set<string>();

        // Detect Node.js/TypeScript projects
        const nodeProjects = await this.detectNodeProjects();
        projects.push(...nodeProjects);
        if (nodeProjects.length > 0) languages.add('javascript');

        // Detect Python projects
        const pythonProjects = await this.detectPythonProjects();
        projects.push(...pythonProjects);
        if (pythonProjects.length > 0) languages.add('python');

        // Detect Java projects
        const javaProjects = await this.detectJavaProjects();
        projects.push(...javaProjects);
        if (javaProjects.length > 0) languages.add('java');

        // Detect C# (.NET) projects
        const csharpProjects = await this.detectCSharpProjects();
        projects.push(...csharpProjects);
        if (csharpProjects.length > 0) languages.add('csharp');

        // Detect Go projects
        const goProjects = await this.detectGoProjects();
        projects.push(...goProjects);
        if (goProjects.length > 0) languages.add('go');

        const isMonorepo = projects.length > 1;

        logger.info(`Detected ${projects.length} project(s) with languages: ${Array.from(languages).join(', ')}`);

        return {
            repoPath: this.repoPath,
            languages: Array.from(languages),
            projects,
            isMonorepo,
        };
    }

    /**
     * Detect Node.js/TypeScript projects
     */
    private async detectNodeProjects(): Promise<ProjectDescriptor[]> {
        const projects: ProjectDescriptor[] = [];
        const packageJsonFiles = await findFiles(this.repoPath, '**/package.json', {
            ignore: ['**/node_modules/**'],
        });

        for (const packageJsonPath of packageJsonFiles) {
            try {
                const content = await readFile(packageJsonPath);
                const packageJson = JSON.parse(content);
                const projectPath = path.dirname(packageJsonPath);
                const relativePath = path.relative(this.repoPath, projectPath);

                // Detect framework
                const framework = this.detectNodeFramework(packageJson);
                const testFramework = this.detectNodeTestFramework(packageJson);
                const language = packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript ? 'typescript' : 'javascript';

                // Find entry points
                const entryPoints: string[] = [];
                if (packageJson.main) entryPoints.push(path.join(projectPath, packageJson.main));
                if (await fileExists(path.join(projectPath, 'src/index.ts'))) entryPoints.push(path.join(projectPath, 'src/index.ts'));
                if (await fileExists(path.join(projectPath, 'src/index.js'))) entryPoints.push(path.join(projectPath, 'src/index.js'));
                if (await fileExists(path.join(projectPath, 'index.ts'))) entryPoints.push(path.join(projectPath, 'index.ts'));
                if (await fileExists(path.join(projectPath, 'index.js'))) entryPoints.push(path.join(projectPath, 'index.js'));

                projects.push({
                    name: packageJson.name || path.basename(projectPath),
                    language,
                    framework,
                    path: relativePath || '.',
                    buildTool: 'npm',
                    testFramework,
                    entryPoints,
                    packageManager: await this.detectNodePackageManager(projectPath),
                    dependencies: { ...packageJson.dependencies, ...packageJson.devDependencies },
                });
            } catch (error) {
                logger.warn(`Failed to parse package.json at ${packageJsonPath}: ${error}`);
            }
        }

        return projects;
    }

    /**
     * Detect Python projects
     */
    private async detectPythonProjects(): Promise<ProjectDescriptor[]> {
        const projects: ProjectDescriptor[] = [];

        // Look for Python project files
        const pythonMarkers = [
            '**/pyproject.toml',
            '**/setup.py',
            '**/requirements.txt',
            '**/Pipfile',
        ];

        const markerFiles = await findFiles(this.repoPath, pythonMarkers, {
            ignore: ['**/venv/**', '**/.venv/**', '**/env/**'],
        });

        // Group by directory
        const projectDirs = new Set<string>();
        for (const file of markerFiles) {
            projectDirs.add(path.dirname(file));
        }

        // If no markers found but Python files exist, treat root as project
        if (projectDirs.size === 0) {
            const pythonFiles = await findFiles(this.repoPath, '**/*.py', {
                ignore: ['**/venv/**', '**/.venv/**', '**/env/**'],
            });
            if (pythonFiles.length > 0) {
                projectDirs.add(this.repoPath);
            }
        }

        for (const projectPath of projectDirs) {
            const relativePath = path.relative(this.repoPath, projectPath);

            // Count actual Python source files (excluding tests, venvs, tooling)
            const sourceFiles = await findFiles(projectPath, '**/*.py', {
                ignore: [
                    '**/venv/**', '**/.venv/**', '**/env/**',
                    '**/tests/**', '**/test/**',    // Exclude test directories
                    '**/__pycache__/**',
                    '**/migrations/**',              // Django migrations
                    '**/site-packages/**',           // Installed packages
                    '**/node_modules/**'             // In case of mixed projects
                ]
            });

            // Only create project if there are actual source files
            if (!sourceFiles || sourceFiles.length === 0) {
                logger.info(`Skipping Python project at ${projectPath}: no app source files found (only config/test files)`);
                continue;
            }

            logger.info(`Found ${sourceFiles.length} Python source file(s) in ${projectPath}`);
            const framework = await this.detectPythonFramework(projectPath);

            // Find entry points
            const entryPoints: string[] = [];
            const commonEntryPoints = ['main.py', 'app.py', 'wsgi.py', 'asgi.py', 'manage.py'];
            for (const entry of commonEntryPoints) {
                if (await fileExists(path.join(projectPath, entry))) {
                    entryPoints.push(path.join(projectPath, entry));
                }
            }

            projects.push({
                name: path.basename(projectPath),
                language: 'python',
                framework,
                path: relativePath || '.',
                buildTool: 'pip',
                testFramework: 'pytest',
                entryPoints,
            });
        }

        return projects;
    }

    /**
     * Detect Java projects
     */
    private async detectJavaProjects(): Promise<ProjectDescriptor[]> {
        const projects: ProjectDescriptor[] = [];

        // Look for Maven projects
        const pomFiles = await findFiles(this.repoPath, '**/pom.xml', {
            ignore: ['**/target/**'],
        });

        for (const pomFile of pomFiles) {
            const projectPath = path.dirname(pomFile);
            const relativePath = path.relative(this.repoPath, projectPath);

            projects.push({
                name: path.basename(projectPath),
                language: 'java',
                framework: 'spring-boot', // Assume Spring Boot for now
                path: relativePath || '.',
                buildTool: 'maven',
                testFramework: 'junit',
                entryPoints: [],
            });
        }

        // Look for Gradle projects
        const gradleFiles = await findFiles(this.repoPath, '**/build.gradle*', {
            ignore: ['**/build/**'],
        });

        for (const gradleFile of gradleFiles) {
            const projectPath = path.dirname(gradleFile);
            const relativePath = path.relative(this.repoPath, projectPath);

            // Skip if already detected via Maven
            if (projects.some(p => p.path === (relativePath || '.'))) continue;

            projects.push({
                name: path.basename(projectPath),
                language: 'java',
                framework: 'spring-boot',
                path: relativePath || '.',
                buildTool: 'gradle',
                testFramework: 'junit',
                entryPoints: [],
            });
        }

        return projects;
    }

    /**
     * Detect Node.js framework
     */
    private detectNodeFramework(packageJson: any): string | undefined {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (deps['@nestjs/core']) return 'nestjs';
        if (deps['next']) return 'nextjs';
        if (deps['express']) return 'express';
        if (deps['react']) return 'react';
        if (deps['vue']) return 'vue';
        if (deps['@angular/core']) return 'angular';

        return undefined;
    }

    /**
     * Detect Node.js test framework
     */
    private detectNodeTestFramework(packageJson: any): string | undefined {
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (deps['jest']) return 'jest';
        if (deps['mocha']) return 'mocha';
        if (deps['vitest']) return 'vitest';

        return 'jest'; // Default to Jest
    }

    /**
     * Detect Node.js package manager
     */
    private async detectNodePackageManager(projectPath: string): Promise<string> {
        if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
        if (await fileExists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
        return 'npm';
    }

    /**
     * Detect Python framework
     */
    private async detectPythonFramework(projectPath: string): Promise<string | undefined> {
        // Check for Django
        if (await fileExists(path.join(projectPath, 'manage.py'))) {
            return 'django';
        }

        // Check requirements or dependencies
        const requirementsFile = path.join(projectPath, 'requirements.txt');
        if (await fileExists(requirementsFile)) {
            const content = await readFile(requirementsFile);
            if (content.includes('django')) return 'django';
            if (content.includes('fastapi')) return 'fastapi';
            if (content.includes('flask')) return 'flask';
        }

        return undefined;
    }

    /**
     * Detect C# (.NET) projects
     */
    private async detectCSharpProjects(): Promise<ProjectDescriptor[]> {
        const projects: ProjectDescriptor[] = [];

        // Look for .csproj files
        const csprojFiles = await findFiles(this.repoPath, '**/*.csproj', {
            ignore: ['**/bin/**', '**/obj/**'],
        });

        for (const csprojFile of csprojFiles) {
            const projectPath = path.dirname(csprojFile);
            const relativePath = path.relative(this.repoPath, projectPath);

            // Read .csproj to detect framework
            let framework: string | undefined;
            let testFramework = 'xunit'; // Default
            const baseName = path.basename(projectPath);
            let isTestProject = /\.Tests$/i.test(baseName);

            try {
                const content = await readFile(csprojFile);
                // Detect test framework from packages
                if (content.includes('xunit')) testFramework = 'xunit';
                else if (content.includes('NUnit')) testFramework = 'nunit';
                else if (content.includes('MSTest')) testFramework = 'mstest';

                // If the project already references a test framework or marks itself as test, skip generation
                if (content.includes('<IsTestProject>true</IsTestProject>') || /TestProjectTypeId/i.test(content)) {
                    isTestProject = true;
                }

                // Detect framework (ASP.NET Core, etc.)
                if (content.includes('Microsoft.AspNetCore')) framework = 'aspnetcore';
            } catch (error) {
                logger.warn(`Failed to read .csproj file at ${csprojFile}: ${error}`);
            }

            if (isTestProject) {
                logger.info(`Skipping C# test project detected at ${csprojFile}`);
                continue;
            }

            projects.push({
                name: path.basename(projectPath),
                language: 'csharp',
                framework,
                path: relativePath || '.',
                buildTool: 'dotnet',
                testFramework,
                entryPoints: [],
            });
        }

        return projects;
    }

    /**
     * Detect Go projects
     */
    private async detectGoProjects(): Promise<ProjectDescriptor[]> {
        const projects: ProjectDescriptor[] = [];

        // Look for go.mod files
        const goModFiles = await findFiles(this.repoPath, '**/go.mod', {
            ignore: ['**/vendor/**'],
        });

        for (const goModFile of goModFiles) {
            const projectPath = path.dirname(goModFile);
            const relativePath = path.relative(this.repoPath, projectPath);

            // Find entry points (main.go)
            const entryPoints: string[] = [];
            const mainFile = path.join(projectPath, 'main.go');
            if (await fileExists(mainFile)) {
                entryPoints.push(mainFile);
            }
            // Check for cmd directory (common pattern)
            const cmdFiles = await findFiles(projectPath, 'cmd/**/main.go', {});
            entryPoints.push(...cmdFiles);

            projects.push({
                name: path.basename(projectPath),
                language: 'go',
                framework: undefined, // Go typically doesn't use frameworks
                path: relativePath || '.',
                buildTool: 'go',
                testFramework: 'testing',
                entryPoints,
            });
        }

        // If no go.mod found but .go files exist, treat as Go project
        if (projects.length === 0) {
            const { findFiles } = await import('../utils/fileUtils');
            const goFiles = await findFiles(this.repoPath, '**/*.go', {
                ignore: ['**/vendor/**'],
            });

            if (goFiles.length > 0) {
                projects.push({
                    name: 'go-project',
                    language: 'go',
                    framework: undefined,
                    path: '.',
                    buildTool: 'go',
                    testFramework: 'testing',
                    entryPoints: [],
                });
            }
        }

        return projects;
    }
}

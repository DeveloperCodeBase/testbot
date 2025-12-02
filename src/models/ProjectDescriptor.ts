/**
 * Describes a detected project within a repository
 */
export interface ProjectDescriptor {
    name: string;
    language: string;
    framework?: string;
    path: string;
    buildTool?: string;
    testFramework?: string;
    entryPoints: string[];
    packageManager?: string;
    dependencies?: Record<string, string>;
}

/**
 * Collection of detected projects
 */
export interface RepoAnalysis {
    repoPath: string;
    languages: string[];
    projects: ProjectDescriptor[];
    isMonorepo: boolean;
}

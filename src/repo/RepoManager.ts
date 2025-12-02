import simpleGit, { SimpleGit } from 'simple-git';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { ensureDir, removeDir, dirExists } from '../utils/fileUtils.js';

/**
 * Manages repository cloning and workspace isolation
 */
export class RepoManager {
    private workspaceRoot: string;
    private git: SimpleGit;

    constructor(workspaceRoot: string = path.join(process.cwd(), 'workspaces')) {
        this.workspaceRoot = workspaceRoot;
        this.git = simpleGit();
    }

    /**
     * Clone a repository or open a local one
     */
    async prepareRepo(input: string): Promise<{ repoPath: string; jobId: string; isLocal: boolean }> {
        const jobId = uuidv4();

        // Check if input is a URL or local path
        const isUrl = input.startsWith('http://') || input.startsWith('https://') || input.startsWith('git@');

        if (isUrl) {
            return await this.cloneRepo(input, jobId);
        } else {
            return await this.openLocalRepo(input, jobId);
        }
    }

    /**
     * Clone a remote repository
     */
    private async cloneRepo(repoUrl: string, jobId: string): Promise<{ repoPath: string; jobId: string; isLocal: boolean }> {
        const repoPath = path.join(this.workspaceRoot, jobId);

        try {
            logger.info(`Cloning repository: ${repoUrl}`);
            await ensureDir(this.workspaceRoot);

            await this.git.clone(repoUrl, repoPath, {
                '--depth': 1, // Shallow clone for faster cloning
            });

            logger.info(`Repository cloned to: ${repoPath}`);
            return { repoPath, jobId, isLocal: false };
        } catch (error) {
            logger.error(`Failed to clone repository: ${error}`);
            throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Open a local repository
     */
    private async openLocalRepo(localPath: string, jobId: string): Promise<{ repoPath: string; jobId: string; isLocal: boolean }> {
        const absolutePath = path.resolve(localPath);

        if (!(await dirExists(absolutePath))) {
            throw new Error(`Local path does not exist: ${absolutePath}`);
        }

        logger.info(`Using local repository: ${absolutePath}`);
        return { repoPath: absolutePath, jobId, isLocal: true };
    }

    /**
     * Create a new branch in the repository
     */
    async createBranch(repoPath: string, branchName: string): Promise<void> {
        try {
            const git = simpleGit(repoPath);
            await git.checkoutLocalBranch(branchName);
            logger.info(`Created branch: ${branchName}`);
        } catch (error) {
            logger.error(`Failed to create branch: ${error}`);
            throw error;
        }
    }

    /**
     * Stage files for commit
     */
    async stageFiles(repoPath: string, files: string[]): Promise<void> {
        try {
            const git = simpleGit(repoPath);
            await git.add(files);
            logger.info(`Staged ${files.length} files`);
        } catch (error) {
            logger.error(`Failed to stage files: ${error}`);
            throw error;
        }
    }

    /**
     * Commit staged files
     */
    async commit(repoPath: string, message: string): Promise<void> {
        try {
            const git = simpleGit(repoPath);
            await git.commit(message);
            logger.info(`Committed: ${message}`);
        } catch (error) {
            logger.error(`Failed to commit: ${error}`);
            throw error;
        }
    }

    /**
     * Push branch to remote
     */
    async push(repoPath: string, branchName: string): Promise<void> {
        try {
            const git = simpleGit(repoPath);
            await git.push('origin', branchName);
            logger.info(`Pushed branch: ${branchName}`);
        } catch (error) {
            logger.error(`Failed to push: ${error}`);
            throw error;
        }
    }

    /**
     * Clean up workspace
     */
    async cleanup(jobId: string): Promise<void> {
        const repoPath = path.join(this.workspaceRoot, jobId);

        try {
            await removeDir(repoPath);
            logger.info(`Cleaned up workspace: ${jobId}`);
        } catch (error) {
            logger.warn(`Failed to clean up workspace ${jobId}: ${error}`);
        }
    }

    /**
     * Get workspace path for job
     */
    getWorkspacePath(jobId: string): string {
        return path.join(this.workspaceRoot, jobId);
    }
}

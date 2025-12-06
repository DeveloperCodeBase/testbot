import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import logger from './logger';

export interface EnvLoadResult {
    loadedFrom: string[];
    tried: string[];
    errors: string[];
}

/**
 * Centralized environment loader that eagerly loads .env files from
 * predictable locations so users never need to manually source them.
 */
export class EnvLoader {
    load(repoPath?: string): EnvLoadResult {
        const tried: string[] = [];
        const loadedFrom: string[] = [];
        const errors: string[] = [];

        const candidates = this.buildCandidatePaths(repoPath);

        for (const candidate of candidates) {
            if (tried.includes(candidate)) continue;
            tried.push(candidate);

            if (!fs.existsSync(candidate)) {
                continue;
            }

            try {
                dotenv.config({ path: candidate });
                loadedFrom.push(candidate);
                logger.info(`✅ Loaded environment variables from ${candidate}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                errors.push(message);
                logger.warn(`⚠️  Failed to load env file ${candidate}: ${message}`);
            }
        }

        if (loadedFrom.length === 0) {
            logger.warn('⚠️  No .env files found in any standard location');
        }

        return { loadedFrom, tried, errors };
    }

    private buildCandidatePaths(repoPath?: string): string[] {
        const paths: string[] = [];

        // Target repo .env (if local path)
        if (repoPath && this.looksLikePath(repoPath)) {
            paths.push(path.resolve(repoPath, '.env'));
        }

        // Current working directory
        paths.push(path.resolve(process.cwd(), '.env'));

        // Package root (helpful when running from compiled dist)
        paths.push(path.resolve(__dirname, '../../.env'));

        // User-level override
        paths.push(path.join(os.homedir(), '.testbot.env'));

        return paths;
    }

    private looksLikePath(input: string): boolean {
        return input.startsWith('.') || input.startsWith('/') || input.includes(path.sep);
    }
}

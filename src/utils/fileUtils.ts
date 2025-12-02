import fs from 'fs/promises';
import path from 'path';
import { glob } from 'fast-glob';

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
}

/**
 * Write content to file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if directory exists
 */
export async function dirExists(dirPath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Find files matching patterns
 */
export async function findFiles(
    directory: string,
    patterns: string | string[],
    options: { ignore?: string[]; absolute?: boolean } = {}
): Promise<string[]> {
    const { ignore = [], absolute = true } = options;

    return await glob(patterns, {
        cwd: directory,
        ignore,
        absolute,
        onlyFiles: true,
    });
}

/**
 * Find directories matching patterns
 */
export async function findDirectories(
    directory: string,
    patterns: string | string[],
    options: { ignore?: string[]; absolute?: boolean } = {}
): Promise<string[]> {
    const { ignore = [], absolute = true } = options;

    return await glob(patterns, {
        cwd: directory,
        ignore,
        absolute,
        onlyDirectories: true,
    });
}

/**
 * Copy file
 */
export async function copyFile(source: string, destination: string): Promise<void> {
    const dir = path.dirname(destination);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(source, destination);
}

/**
 * Remove directory recursively
 */
export async function removeDir(dirPath: string): Promise<void> {
    await fs.rm(dirPath, { recursive: true, force: true });
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
    const stat = await fs.stat(filePath);
    return stat.size;
}

/**
 * Find source files for a project, excluding tests and build artifacts
 */
export async function findSourceFiles(
    projectPath: string,
    language: string,
    excludePatterns: string[] = []
): Promise<string[]> {
    // Language-specific patterns
    const languagePatterns: { [key: string]: string[] } = {
        typescript: ['**/*.ts', '**/*.tsx'],
        javascript: ['**/*.js', '**/*.jsx'],
        python: ['**/*.py'],
        java: ['**/*.java'],
    };

    const patterns = languagePatterns[language.toLowerCase()] || ['**/*'];

    // Default exclude patterns
    const defaultExcludes = [
        '**/node_modules/**',
        '**/vendor/**',
        '**/dist/**',
        '**/build/**',
        '**/target/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/__tests__/**',
        '**/tests/**',
        '**/test/**',
        '**/*.d.ts', // TypeScript declaration files
        '**/coverage/**',
        '**/.git/**',
    ];

    const allExcludes = [...defaultExcludes, ...excludePatterns];

    const files = await glob(patterns, {
        cwd: projectPath,
        ignore: allExcludes,
        absolute: true,
        onlyFiles: true,
    });

    return files;
}


import path from 'path';

/**
 * Normalize file paths to prevent duplications and ensure consistency
 */
export class PathNormalizer {
    /**
     * Normalize a file path relative to a base directory
     * Prevents issues like: /abs/path/project/project/file.ts
     */
    static normalizeFilePath(basePath: string, filePath: string): string {
        // If filePath is already absolute and contains basePath, extract relative part
        if (path.isAbsolute(filePath)) {
            // Check if filePath already contains the basePath
            const normalized = path.normalize(filePath);
            const normalizedBase = path.normalize(basePath);

            if (normalized.startsWith(normalizedBase)) {
                // Extract the relative path
                const relativePart = path.relative(normalizedBase, normalized);
                return path.join(basePath, relativePart);
            }

            // If it doesn't contain basePath, it might be a duplicated path
            // Try to find the project name in the path and deduplicate
            const baseSegments = normalizedBase.split(path.sep);
            const fileSegments = normalized.split(path.sep);

            // Find where duplication starts
            let duplicationIndex = -1;
            for (let i = baseSegments.length; i < fileSegments.length; i++) {
                const segment = fileSegments[i];
                // Check if this segment matches any base segment (duplication indicator)
                const baseMatch = baseSegments.findIndex((s, idx) =>
                    idx > 0 && s === segment && fileSegments[i - 1] === baseSegments[idx - 1]
                );
                if (baseMatch !== -1) {
                    duplicationIndex = i - 1;
                    break;
                }
            }

            if (duplicationIndex !== -1) {
                // Remove duplicated segments
                const cleanedSegments = fileSegments.slice(0, duplicationIndex).concat(
                    fileSegments.slice(duplicationIndex + (fileSegments.length - duplicationIndex) / 2)
                );
                return cleanedSegments.join(path.sep);
            }

            return normalized;
        }

        // For relative paths, just normalize and join with base
        return path.normalize(path.join(basePath, filePath));
    }

    /**
     * Ensure a path uses forward slashes (for cross-platform consistency in reports)
     */
    static toUnixPath(filePath: string): string {
        return filePath.split(path.sep).join('/');
    }

    /**
     * Get relative path from base, handling duplications
     */
    static getRelativePath(basePath: string, filePath: string): string {
        const normalized = this.normalizeFilePath(basePath, filePath);
        return path.relative(basePath, normalized);
    }

    /**
     * Standardize test file path based on language and test type
     */
    static getStandardTestPath(
        projectPath: string,
        sourceFile: string,
        testType: 'unit' | 'integration' | 'e2e',
        language: string
    ): string {
        const baseName = path.basename(sourceFile, path.extname(sourceFile));
        const ext = language === 'typescript' || language === 'javascript' ? '.test.ts' :
            language === 'python' ? '_test.py' :
                language === 'java' ? 'Test.java' :
                    language === 'csharp' ? 'Tests.cs' : '.test';

        let testDir: string;
        if (language === 'typescript' || language === 'javascript') {
            testDir = path.join(projectPath, '__tests__', testType);
        } else if (language === 'python') {
            testDir = path.join(projectPath, 'tests', testType);
        } else if (language === 'java') {
            testDir = path.join(projectPath, 'src', 'test', 'java');
        } else if (language === 'csharp') {
            testDir = path.join(projectPath, 'Tests');
        } else {
            testDir = path.join(projectPath, 'tests', testType);
        }

        return path.join(testDir, `${baseName}${ext}`);
    }
}

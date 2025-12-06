import fs from 'fs/promises';

/**
 * ESM Detector - Identifies ESM-only packages that require special handling in Jest
 */
export class ESMDetector {
    // Known ESM-only packages that commonly cause issues in Jest/Node
    private static readonly ESM_ONLY_PACKAGES = [
        'uuid',
        'node-fetch',
        'chalk',
        'ora',
        'nanoid',
        'execa',
        'globby',
        'got',
        'p-map',
        'p-queue',
        'pretty-bytes',
        'escape-string-regexp'
    ];

    /**
     * Check if a package is known to be ESM-only
     */
    static isESMOnlyPackage(packageName: string): boolean {
        // Remove scope if present (e.g., @org/package -> package)
        const baseName = packageName.includes('/') ? packageName.split('/').pop()! : packageName;
        return this.ESM_ONLY_PACKAGES.includes(baseName) || this.ESM_ONLY_PACKAGES.includes(packageName);
    }

    /**
     * Detect ESM-only imports in a file
     */
    static async detectESMImportsInFile(filePath: string): Promise<string[]> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return this.detectESMImportsInContent(content);
        } catch (error) {
            return [];
        }
    }

    /**
     * Detect ESM-only imports in content
     */
    static detectESMImportsInContent(content: string): string[] {
        const esmImports: string[] = [];

        // Match import statements
        const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            // Only check external packages (not relative paths)
            if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
                // Extract package name (handle scoped packages)
                const packageName = importPath.startsWith('@')
                    ? importPath.split('/').slice(0, 2).join('/')
                    : importPath.split('/')[0];

                if (this.isESMOnlyPackage(packageName) && !esmImports.includes(packageName)) {
                    esmImports.push(packageName);
                }
            }
        }

        // Also check require() statements
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
                const packageName = importPath.startsWith('@')
                    ? importPath.split('/').slice(0, 2).join('/')
                    : importPath.split('/')[0];

                if (this.isESMOnlyPackage(packageName) && !esmImports.includes(packageName)) {
                    esmImports.push(packageName);
                }
            }
        }

        return esmImports;
    }

    /**
     * Detect all ESM imports across multiple files
     */
    static async detectESMImportsInFiles(filePaths: string[]): Promise<Map<string, string[]>> {
        const results = new Map<string, string[]>();

        for (const filePath of filePaths) {
            const imports = await this.detectESMImportsInFile(filePath);
            if (imports.length > 0) {
                results.set(filePath, imports);
            }
        }

        return results;
    }

    /**
     * Generate jest.mock() statement for an ESM package
     */
    static generateJestMock(packageName: string): string {
        return `jest.mock('${packageName}', () => require('${packageName}'));`;
    }

    /**
     * Generate transformIgnorePatterns entry for ESM packages
     */
    static generateTransformIgnorePattern(esmPackages: string[]): string {
        if (esmPackages.length === 0) return '';

        const packagePattern = esmPackages
            .map(pkg => pkg.replace('@', '\\\\@').replace('/', '\\\\/'))
            .join('|');

        return `'node_modules/(?!(${packagePattern})/)'`;
    }
}

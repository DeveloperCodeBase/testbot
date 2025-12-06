import path from 'path';
import fs from 'fs';

/**
 * Import Sanity Gate
 * Validates that generated test imports actually exist to prevent hallucinated tests
 */
export class ImportSanityGate {
    /**
     * Validate all imports in a test file
     * Returns { valid: boolean, issues: string[] }
     */
    static async validateTestFile(testFilePath: string, projectPath: string): Promise<{
        valid: boolean;
        issues: string[];
    }> {
        const issues: string[] = [];

        try {
            const content = fs.readFileSync(testFilePath, 'utf-8');
            const imports = this.extractImports(content);

            for (const imp of imports) {
                if (imp.isRelative) {
                    const resolved = this.resolveRelativePath(testFilePath, imp.path);
                    if (!this.fileExists(resolved, projectPath)) {
                        issues.push(`Import not found: ${imp.original} (resolved to: ${resolved})`);
                    }
                }
            }
        } catch (error) {
            issues.push(`Failed to read test file: ${error}`);
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Validate and optionally skip/fix test file if imports are unresolvable
     * Returns whether the file should be written, with optional fixed content
     */
    static async validateOrSkip(
        testFilePath: string,
        testContent: string,
        projectPath: string
    ): Promise<{
        shouldWrite: boolean;
        fixedContent?: string;
        issues: string[];
        skippedReason?: string;
    }> {
        const issues: string[] = [];
        const imports = this.extractImports(testContent);
        const unresolvedImports: Array<{ original: string; path: string }> = [];
        const corrections: Map<string, string> = new Map(); // originalPath -> correctedPath

        for (const imp of imports) {
            if (imp.isRelative) {
                // Try to resolve and correct the import
                const resolved = await this.resolveImportPath(imp.path, testFilePath, projectPath);

                if (!resolved.found) {
                    unresolvedImports.push({ original: imp.original, path: imp.path });
                    issues.push(`Cannot resolve import: ${imp.path}`);
                } else if (resolved.correctedPath && resolved.correctedPath !== imp.path) {
                    // We found it but need to correct the path
                    corrections.set(imp.path, resolved.correctedPath);
                    issues.push(`Import path corrected: ${imp.path} → ${resolved.correctedPath}`);
                }
            }
        }

        // If too many unresolvable imports, skip the file
        if (unresolvedImports.length > 3) {
            return {
                shouldWrite: false,
                issues,
                skippedReason: `Too many unresolvable imports (${unresolvedImports.length})`
            };
        }

        // Apply corrections and/or comment out unresolvable imports
        if (corrections.size > 0 || unresolvedImports.length > 0) {
            let fixedContent = testContent;

            // First, rewrite correctable imports
            for (const [original, corrected] of corrections) {
                // Replace the import path in all matching import statements
                const importPathRegex = new RegExp(`(['"\`])${this.escapeRegex(original)}\\1`, 'g');
                fixedContent = fixedContent.replace(importPathRegex, `$1${corrected}$1`);
            }

            // Then, comment out unresolvable imports
            for (const unresolved of unresolvedImports) {
                fixedContent = fixedContent.replace(
                    unresolved.original,
                    `// SKIPPED: Unresolvable import - ${unresolved.original}`
                );
            }

            return {
                shouldWrite: true,
                fixedContent,
                issues
            };
        }

        // All imports are valid
        return {
            shouldWrite: true,
            issues
        };
    }

    /**
     * Escape special regex characters
     */
    private static escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Extract import/require statements from test content
     */
    private static extractImports(content: string): Array<{
        original: string;
        path: string;
        isRelative: boolean;
    }> {
        const imports: Array<{ original: string; path: string; isRelative: boolean }> = [];

        // Match ES6 imports: import ... from '...'
        const es6ImportRegex = /import\s+(?:(?:\{[^}]*\})|(?:[^'"]*?))\s+from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = es6ImportRegex.exec(content)) !== null) {
            const importPath = match[1];
            imports.push({
                original: match[0],
                path: importPath,
                isRelative: importPath.startsWith('.') || importPath.startsWith('/')
            });
        }

        //  Match CommonJS require const  = require('')
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content)) !== null) {
            const importPath = match[1];
            imports.push({
                original: match[0],
                path: importPath,
                isRelative: importPath.startsWith('.') || importPath.startsWith('/')
            });
        }

        return imports;
    }

    /**
     * Resolve relative import path to absolute
     */
    private static resolveRelativePath(testFilePath: string, importPath: string): string {
        const testDir = path.dirname(testFilePath);
        const resolved = path.resolve(testDir, importPath);

        // Try with common extensions
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        for (const ext of extensions) {
            const fullPath = resolved + ext;
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }

        return resolved;
    }

    /**
     * Advanced path resolution with deep search
     * Searches for the imported file in common locations
     */
    private static async resolveImportPath(
        importPath: string,
        testFilePath: string,
        projectPath: string
    ): Promise<{
        found: boolean;
        resolvedPath?: string;
        correctedPath?: string; // Corrected relative path from test to source
    }> {
        const testDir = path.dirname(testFilePath);

        // Try direct resolution first
        const directResolved = path.resolve(testDir, importPath);
        if (this.fileExistsWithExtensions(directResolved)) {
            return { found: true, resolvedPath: directResolved };
        }

        // Extract the filename/module name
        const fileName = path.basename(importPath);
        const searchPaths = [
            path.join(projectPath, 'src'),
            path.join(projectPath, 'lib'),
            path.join(projectPath, 'app'),
            path.join(projectPath, 'services'),
            projectPath
        ];

        // Search for the file in common locations
        for (const searchPath of searchPaths) {
            const foundPath = await this.searchForFile(fileName, searchPath);
            if (foundPath) {
                // Compute the correct relative path from test to source
                const correctedPath = this.computeRelativePath(testFilePath, foundPath);
                return {
                    found: true,
                    resolvedPath: foundPath,
                    correctedPath
                };
            }
        }

        return { found: false };
    }

    /**
     * Search for a file recursively in a directory
     */
    private static async searchForFile(fileName: string, searchDir: string): Promise<string | null> {
        if (!fs.existsSync(searchDir)) {
            return null;
        }

        const extensions = ['', '.ts', '.tsx', '.js', '.jsx'];

        try {
            const entries = fs.readdirSync(searchDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(searchDir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules and common ignore dirs
                    if (['node_modules', 'dist', 'build', '.git', '__pycache__'].includes(entry.name)) {
                        continue;
                    }

                    // Recursive search (limit depth to avoid performance issues)
                    const found = await this.searchForFile(fileName, fullPath);
                    if (found) return found;
                } else {
                    // Check if this file matches
                    for (const ext of extensions) {
                        if (entry.name === fileName + ext || entry.name === fileName) {
                            return fullPath;
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors, etc.
        }

        return null;
    }

    /**
     * Compute correct relative path from test file to source file
     */
    private static computeRelativePath(fromFile: string, toFile: string): string {
        const fromDir = path.dirname(fromFile);
        let relativePath = path.relative(fromDir, toFile);

        // Ensure it starts with ./ or ../
        if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }

        // Remove extension for cleaner imports
        relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

        return relativePath;
    }

    /**
     * Check if file exists with common extensions
     */
    private static fileExistsWithExtensions(basePath: string): boolean {
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        for (const ext of extensions) {
            if (fs.existsSync(basePath + ext)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if file exists (with extension variants)
     */
    private static fileExists(filePath: string, projectPath: string): boolean {
        // Ensure filePath is within project
        if (!filePath.startsWith(projectPath)) {
            // This might be an import from node_modules, allow it
            // Only check relative imports within project
            return true;
        }

        const extensions = ['', '.ts', '.tsx', '.js', '.jsx'];
        for (const ext of extensions) {
            if (fs.existsSync(filePath + ext)) {
                return true;
            }
        }

        // Check if it's a directory with index file
        const indexFiles = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
        for (const indexFile of indexFiles) {
            if (fs.existsSync(filePath + indexFile)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Fix invalid imports by removing or commenting them out
     * Returns the fixed content
     */
    static fixInvalidImports(content: string, issues: string[]): string {
        let fixed = content;

        for (const issue of issues) {
            // Extract the import statement from the issue
            const match = issue.match(/Import not found: (.*?) \(/);
            if (match) {
                const importString = match[1];
                // Comment out the invalid import
                fixed = fixed.replace(importString, `// FIXED: Invalid import removed - ${importString}`);
            }
        }

        return fixed;
    }
}

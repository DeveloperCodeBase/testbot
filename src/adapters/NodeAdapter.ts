import path from 'path';
import { LanguageAdapter } from './LanguageAdapter.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { CoverageReport, FileCoverage, CoverageSummary } from '../models/CoverageReport.js';
import { readFile } from '../utils/fileUtils.js';

/**
 * Language adapter for Node.js/TypeScript projects
 */
export class NodeAdapter implements LanguageAdapter {
    language = 'javascript';

    canHandle(project: ProjectDescriptor): boolean {
        return project.language === 'javascript' || project.language === 'typescript';
    }

    getTestFramework(project: ProjectDescriptor): string {
        return project.testFramework || 'jest';
    }

    getBuildCommand(project: ProjectDescriptor): string | null {
        if (project.language === 'typescript') {
            return `${this.getPackageManager(project)} run build`;
        }
        return null;
    }

    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        const pm = this.getPackageManager(project);
        const framework = this.getTestFramework(project);

        if (framework === 'react') {
            // For React, we assume Vitest + React Testing Library
            // User requested specific scripts or explicit commands
            if (testType === 'unit') {
                return `${pm} run test:unit`; // Assuming script exists as per requirement, or fallback to vitest
            } else if (testType === 'integration') {
                return `${pm} run test:integration`;
            } else if (testType === 'e2e') {
                return `${pm} run test:e2e`;
            }
        }

        if (framework === 'jest') {
            if (testType === 'unit') {
                return `${pm} test -- --testPathPattern="src/.*__tests__"`;
            } else if (testType === 'integration') {
                return `${pm} test -- --testPathPattern=".*\\.integration\\.test"`;
            } else if (testType === 'e2e') {
                return `${pm} test -- --testPathPattern="e2e"`;
            }
        } else if (framework === 'mocha') {
            if (testType === 'unit') {
                return `${pm} test`;
            } else if (testType === 'integration') {
                return `${pm} test -- --grep integration`;
            } else if (testType === 'e2e') {
                return `${pm} test -- --grep e2e`;
            }
        } else if (framework === 'vitest' || framework === 'react') {
            // Use npx vitest run to avoid needing package.json scripts
            // We can also use npm test if we are sure, but npx vitest is safer for auto-fix context
            // actually, let's try npm test first if it exists, but here we return the command string.
            // Safe fallback: npx vitest run
            return `npx vitest run`;
        }

        return `${pm} test`;
    }

    getCoverageCommand(project: ProjectDescriptor): string | null {
        const pm = this.getPackageManager(project);
        const framework = this.getTestFramework(project);

        if (framework === 'jest') {
            return `${pm} test -- --coverage --coverageReporters=json-summary --coverageReporters=json`;
        } else if (framework === 'vitest') {
            return `${pm} run test -- --coverage`;
        }

        return null;
    }

    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor): string {
        const ext = sourceFile.endsWith('.ts') ? '.ts' : '.js';
        const baseName = path.basename(sourceFile, ext);

        if (testType === 'unit') {
            if (_project.framework === 'react') {
                return path.join('src', 'tests', 'unit', `${baseName}.test${ext}x`);
            }
            // Unit tests go in tests/unit
            // Or co-located? Let's stick to tests/unit for now as per previous logic, 
            // but for Jest we might want __tests__?
            // The previous logic was tests/unit. Let's keep it but make it relative.
            return path.join('tests', 'unit', `${baseName}.test${ext}`);
        } else if (testType === 'integration') {
            if (_project.framework === 'react') {
                return path.join('src', 'tests', 'integration', `${baseName}.test${ext}x`);
            }
            return path.join('tests', 'integration', `${baseName}.integration.test${ext}`);
        } else if (testType === 'e2e') {
            if (_project.framework === 'react') {
                return path.join('src', 'tests', 'e2e', `${baseName}.test${ext}x`);
            }
            return path.join('tests', 'e2e', `${baseName}.e2e.test${ext}`);
        }

        return `${sourceFile}.test${ext}`;
    }

    getTestDirectory(project: ProjectDescriptor, _testType: 'unit' | 'integration' | 'e2e'): string {
        // Return path relative to project root
        if (project.framework === 'react' || project.testFramework === 'vitest') {
            return 'src';
        }

        // For Jest/Node, we often have tests in src or tests
        // If we return '.', findFiles will search everything.
        // But we want to avoid node_modules.
        // Let's return '.' and rely on findFiles default excludes (which usually include node_modules)
        // Or better, return 'src' if it exists? 
        // For now, let's return '.' to be safe as tests might be in 'tests' folder too.
        return '.';
    }

    getTestFilePattern(testType: 'unit' | 'integration' | 'e2e'): string {
        if (testType === 'unit') {
            return '**/{__tests__,tests}/**/*.test.{ts,js,tsx,jsx}';
        } else if (testType === 'integration') {
            return '**/*.integration.test.{ts,js,tsx,jsx}';
        } else if (testType === 'e2e') {
            return '**/*.e2e.{ts,js,tsx,jsx}'; // Matches .e2e.ts or .e2e.test.ts
        }
        return '**/*.test.{ts,js,tsx,jsx}';
    }

    async parseCoverage(_coverageOutput: string, projectPath: string): Promise<CoverageReport> {
        try {
            // Try to read coverage-summary.json
            const coverageSummaryPath = path.join(projectPath, 'coverage', 'coverage-summary.json');
            const summaryContent = await readFile(coverageSummaryPath);
            const summary = JSON.parse(summaryContent);

            const files: FileCoverage[] = [];
            const overall = summary.total;

            for (const [filePath, data] of Object.entries(summary)) {
                if (filePath === 'total') continue;

                const fileData = data as any;
                files.push({
                    path: filePath,
                    lines: this.convertCoverage(fileData.lines),
                    functions: this.convertCoverage(fileData.functions),
                    branches: this.convertCoverage(fileData.branches),
                    statements: this.convertCoverage(fileData.statements),
                    uncoveredLines: [],
                });
            }

            return {
                overall: {
                    lines: this.convertCoverage(overall.lines),
                    functions: this.convertCoverage(overall.functions),
                    branches: this.convertCoverage(overall.branches),
                    statements: this.convertCoverage(overall.statements),
                },
                files,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            throw new Error(`Failed to parse coverage: ${error}`);
        }
    }

    private convertCoverage(data: any): CoverageSummary {
        return {
            total: data.total || 0,
            covered: data.covered || 0,
            percentage: data.pct || 0,
        };
    }

    private getPackageManager(project: ProjectDescriptor): string {
        return project.packageManager || 'npm';
    }
}

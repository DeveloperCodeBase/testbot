import path from 'path';
import { LanguageAdapter } from './LanguageAdapter';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { CoverageReport, FileCoverage, CoverageSummary } from '../models/CoverageReport';
import { readFile } from '../utils/fileUtils';

/**
 * Language adapter for Python projects
 */
export class PythonAdapter implements LanguageAdapter {
    language = 'python';

    canHandle(project: ProjectDescriptor): boolean {
        return project.language === 'python';
    }

    getTestFramework(project: ProjectDescriptor): string {
        if (project.testFramework !== undefined) {
            return project.testFramework;
        }
        return 'pytest';
    }

    getBuildCommand(_project: ProjectDescriptor): string | null {
        // Create venv and install dependencies
        // We use a shell command sequence to ensure setup
        return 'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt || echo "Requirements install failed but continuing"';
    }

    getTestCommand(project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        const framework = this.getTestFramework(project);
        const pythonExec = this.getPythonExecutable(project);

        if (framework === 'pytest') {
            if (testType === 'unit') {
                return `${pythonExec} -m pytest tests/unit -v`;
            } else if (testType === 'integration') {
                return `${pythonExec} -m pytest tests/integration -v`;
            } else if (testType === 'e2e') {
                return `${pythonExec} -m pytest tests/e2e -v`;
            }
        } else if (framework === 'unittest') {
            return `${pythonExec} -m unittest discover`;
        }

        return `${pythonExec} -m pytest -v`;
    }

    getCoverageCommand(project: ProjectDescriptor): string | null {
        const pythonExec = this.getPythonExecutable(project);
        return `${pythonExec} -m pytest --cov=. --cov-report=json --cov-report=term`;
    }

    private getPythonExecutable(_project: ProjectDescriptor): string {
        // Check for .venv in project root
        // Note: In a real implementation we would check if the file exists, 
        // but here we construct the path assuming the executor will handle missing venv
        // or we can check existence if we had async access here.
        // For now, we'll assume .venv if it's a standard setup, or fallback to python3
        return `./.venv/bin/python`;
    }

    getTestFilePath(sourceFile: string, testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor): string {
        const baseName = path.basename(sourceFile, '.py');

        if (testType === 'unit') {
            return path.join('tests', 'unit', `test_${baseName}.py`);
        } else if (testType === 'integration') {
            return path.join('tests', 'integration', `test_${baseName}.py`);
        } else if (testType === 'e2e') {
            return path.join('tests', 'e2e', `test_${baseName}.py`);
        }

        return path.join('tests', `test_${baseName}.py`);
    }

    getTestDirectory(_project: ProjectDescriptor, testType: 'unit' | 'integration' | 'e2e'): string {
        return path.join('tests', testType);
    }

    getTestFilePattern(_testType: 'unit' | 'integration' | 'e2e'): string {
        return '**/test_*.py';
    }

    async parseCoverage(_coverageOutput: string, projectPath: string): Promise<CoverageReport> {
        try {
            // Try to read coverage.json
            const coverageJsonPath = path.join(projectPath, 'coverage.json');
            const coverageContent = await readFile(coverageJsonPath);
            const coverage = JSON.parse(coverageContent);

            const files: FileCoverage[] = [];
            let totalLines = 0;
            let coveredLines = 0;
            let totalFunctions = 0;
            let coveredFunctions = 0;
            let totalBranches = 0;
            let coveredBranches = 0;

            for (const [filePath, data] of Object.entries(coverage.files || {})) {
                const fileData = data as any;
                const summary = fileData.summary;

                const lineCoverage: CoverageSummary = {
                    total: summary.num_statements,
                    covered: summary.covered_lines,
                    percentage: summary.percent_covered,
                };

                files.push({
                    path: filePath,
                    lines: lineCoverage,
                    functions: { total: 0, covered: 0, percentage: 0 },
                    branches: { total: 0, covered: 0, percentage: 0 },
                    uncoveredLines: fileData.missing_lines || [],
                });

                totalLines += summary.num_statements;
                coveredLines += summary.covered_lines;
            }

            return {
                overall: {
                    lines: {
                        total: totalLines,
                        covered: coveredLines,
                        percentage: totalLines > 0 ? (coveredLines / totalLines) * 100 : 0,
                    },
                    functions: {
                        total: totalFunctions,
                        covered: coveredFunctions,
                        percentage: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0,
                    },
                    branches: {
                        total: totalBranches,
                        covered: coveredBranches,
                        percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0,
                    },
                },
                files,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            throw new Error(`Failed to parse coverage: ${error}`);
        }
    }
}

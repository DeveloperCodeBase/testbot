import path from 'path';
import { parseStringPromise } from 'xml2js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import { CoverageReport, FileCoverage, CoverageMetrics } from '../models/CoverageModels.js';
import logger from '../utils/logger.js';
import { fileExists, readFile } from '../utils/fileUtils.js';

export class CoverageAnalyzer {

    /**
     * Analyze coverage for a project
     */
    async analyzeCoverage(
        project: ProjectDescriptor,
        projectPath: string
    ): Promise<CoverageReport | null> {
        logger.info(`Analyzing coverage for ${project.name}`);

        // Try to find coverage reports
        // Jest: coverage/coverage-final.json
        // Pytest: coverage.xml
        // Java: target/site/jacoco/jacoco.xml

        const jestPath = path.join(projectPath, 'coverage', 'coverage-final.json');
        if (await fileExists(jestPath)) {
            return await this.parseJestCoverage(project.name, jestPath);
        }

        const coberturaPath = path.join(projectPath, 'coverage.xml');
        if (await fileExists(coberturaPath)) {
            return await this.parseCoberturaCoverage(project.name, coberturaPath);
        }

        const jacocoPath = path.join(projectPath, 'target', 'site', 'jacoco', 'jacoco.xml');
        if (await fileExists(jacocoPath)) {
            return await this.parseJacocoCoverage(project.name, jacocoPath);
        }

        logger.warn(`No coverage report found for ${project.name}`);
        return null;
    }

    private async parseJestCoverage(projectName: string, reportPath: string): Promise<CoverageReport | null> {
        const content = await readFile(reportPath);
        const json = JSON.parse(content);

        const files: FileCoverage[] = [];
        let totalStatements = 0, coveredStatements = 0;
        let totalBranches = 0, coveredBranches = 0;
        let totalFunctions = 0, coveredFunctions = 0;
        let totalLines = 0, coveredLines = 0;

        for (const filePath in json) {
            const fileData = json[filePath];
            const relativePath = path.relative(path.dirname(path.dirname(reportPath)), filePath); // approximate relative path

            // Calculate metrics for file
            const s = this.calculateJestMetrics(fileData.s);
            const b = this.calculateJestMetrics(fileData.b); // branches map to arrays
            const f = this.calculateJestMetrics(fileData.f);

            // Lines are tricky in Jest JSON, usually inferred from statements or l map
            // We'll use statements as proxy for lines if l map is complex, but l map is standard
            // l: { lineNum: count }
            const lMetrics = this.calculateJestLineMetrics(fileData.l);

            // Uncovered lines
            const uncoveredLines: number[] = [];
            for (const line in fileData.l) {
                if (fileData.l[line] === 0) {
                    uncoveredLines.push(parseInt(line));
                }
            }

            files.push({
                path: relativePath,
                statements: s,
                branches: b,
                functions: f,
                lines: lMetrics,
                uncoveredLines
            });

            totalStatements += s.total; coveredStatements += s.covered;
            totalBranches += b.total; coveredBranches += b.covered;
            totalFunctions += f.total; coveredFunctions += f.covered;
            totalLines += lMetrics.total; coveredLines += lMetrics.covered;
        }

        const overall = {
            statements: this.createMetrics(totalStatements, coveredStatements),
            branches: this.createMetrics(totalBranches, coveredBranches),
            functions: this.createMetrics(totalFunctions, coveredFunctions),
            lines: this.createMetrics(totalLines, coveredLines)
        };

        // If no coverage was actually collected, return null
        if (overall.statements.total === 0 && overall.branches.total === 0 && overall.lines.total === 0) {
            logger.warn(`Coverage report exists but contains no data for ${projectName}`);
            return null;
        }

        return {
            project: projectName,
            timestamp: new Date().toISOString(),
            overall,
            files
        };
    }

    private calculateJestMetrics(map: Record<string, number | number[]>): CoverageMetrics {
        let total = 0;
        let covered = 0;
        for (const key in map) {
            const val = map[key];
            if (Array.isArray(val)) {
                // Branches: [count, count]
                total += val.length;
                covered += val.filter(c => c > 0).length;
            } else {
                total++;
                if (val > 0) covered++;
            }
        }
        return this.createMetrics(total, covered);
    }

    private calculateJestLineMetrics(map: Record<string, number>): CoverageMetrics {
        let total = 0;
        let covered = 0;
        for (const key in map) {
            total++;
            if (map[key] > 0) covered++;
        }
        return this.createMetrics(total, covered);
    }

    private async parseCoberturaCoverage(projectName: string, reportPath: string): Promise<CoverageReport> {
        const content = await readFile(reportPath);
        const xml = await parseStringPromise(content);

        const coverage = xml.coverage;
        const packages = coverage.packages ? coverage.packages[0].package : [];

        const files: FileCoverage[] = [];
        let totalLines = 0, coveredLines = 0;
        let totalBranches = 0, coveredBranches = 0;

        // Cobertura structure: coverage -> packages -> package -> classes -> class -> lines -> line

        if (packages) {
            for (const pkg of packages) {
                const classes = pkg.classes ? pkg.classes[0].class : [];
                for (const cls of classes) {
                    const filename = cls.$.filename;
                    const lines = cls.lines ? cls.lines[0].line : [];

                    const uncoveredLines: number[] = [];
                    let fileTotalLines = 0;
                    let fileCoveredLines = 0;
                    let fileTotalBranches = 0;
                    let fileCoveredBranches = 0;

                    for (const line of lines) {
                        fileTotalLines++;
                        const hits = parseInt(line.$.hits);
                        if (hits > 0) {
                            fileCoveredLines++;
                        } else {
                            uncoveredLines.push(parseInt(line.$.number));
                        }

                        if (line.$.branch === 'true') {
                            // condition-coverage="50% (1/2)"
                            const condition = line.$['condition-coverage'];
                            if (condition) {
                                const match = condition.match(/\((\d+)\/(\d+)\)/);
                                if (match) {
                                    const covered = parseInt(match[1]);
                                    const total = parseInt(match[2]);
                                    fileTotalBranches += total;
                                    fileCoveredBranches += covered;
                                }
                            }
                        }
                    }

                    files.push({
                        path: filename,
                        statements: this.createMetrics(fileTotalLines, fileCoveredLines), // Cobertura treats lines as statements roughly
                        branches: this.createMetrics(fileTotalBranches, fileCoveredBranches),
                        functions: this.createMetrics(0, 0), // Cobertura often doesn't give function details easily in basic xml
                        lines: this.createMetrics(fileTotalLines, fileCoveredLines),
                        uncoveredLines
                    });

                    totalLines += fileTotalLines; coveredLines += fileCoveredLines;
                    totalBranches += fileTotalBranches; coveredBranches += fileCoveredBranches;
                }
            }
        }

        return {
            project: projectName,
            timestamp: new Date().toISOString(),
            overall: {
                statements: this.createMetrics(totalLines, coveredLines),
                branches: this.createMetrics(totalBranches, coveredBranches),
                functions: this.createMetrics(0, 0), // Not available
                lines: this.createMetrics(totalLines, coveredLines)
            },
            files
        };
    }

    private async parseJacocoCoverage(projectName: string, reportPath: string): Promise<CoverageReport> {
        const content = await readFile(reportPath);
        const xml = await parseStringPromise(content);

        const report = xml.report;
        const packages = report.package || [];

        const files: FileCoverage[] = [];

        // Counters
        let totalInst = 0, coveredInst = 0;
        let totalBranch = 0, coveredBranch = 0;
        let totalLine = 0, coveredLine = 0;
        let totalMethod = 0, coveredMethod = 0;

        for (const pkg of packages) {
            const sourceFiles = pkg.sourcefile || [];
            for (const sf of sourceFiles) {
                const filename = path.join(pkg.$.name, sf.$.name); // package/filename

                // Calculate file metrics from counters
                const counters = sf.counter || [];
                const getCounter = (type: string) => {
                    const c = counters.find((x: any) => x.$.type === type);
                    if (c) {
                        const missed = parseInt(c.$.missed);
                        const covered = parseInt(c.$.covered);
                        return { total: missed + covered, covered, missed };
                    }
                    return { total: 0, covered: 0, missed: 0 };
                };

                const inst = getCounter('INSTRUCTION');
                const branch = getCounter('BRANCH');
                const line = getCounter('LINE');
                const method = getCounter('METHOD');

                // Uncovered lines? JaCoCo XML has <line> elements inside <sourcefile> sometimes?
                // Usually it's just counters. To get line numbers we need the HTML or CSV, or detailed XML.
                // The standard XML has <line> elements? Let's check.
                // Yes, <sourcefile> has <line nr="1" mi="0" ci="3" ... />

                const uncoveredLines: number[] = [];
                if (sf.line) {
                    for (const l of sf.line) {
                        if (parseInt(l.$.mi) > 0 || parseInt(l.$.ci) === 0) { // missed instructions > 0 or covered instructions = 0
                            // Wait, mi=missed instructions. If mi > 0, it's partially or fully uncovered.
                            // If ci=0, it's fully uncovered.
                            // Let's count as uncovered if ci=0 (fully missed).
                            if (parseInt(l.$.ci) === 0) {
                                uncoveredLines.push(parseInt(l.$.nr));
                            }
                        }
                    }
                }

                files.push({
                    path: filename,
                    statements: this.createMetrics(inst.total, inst.covered),
                    branches: this.createMetrics(branch.total, branch.covered),
                    functions: this.createMetrics(method.total, method.covered),
                    lines: this.createMetrics(line.total, line.covered),
                    uncoveredLines
                });

                totalInst += inst.total; coveredInst += inst.covered;
                totalBranch += branch.total; coveredBranch += branch.covered;
                totalLine += line.total; coveredLine += line.covered;
                totalMethod += method.total; coveredMethod += method.covered;
            }
        }

        return {
            project: projectName,
            timestamp: new Date().toISOString(),
            overall: {
                statements: this.createMetrics(totalInst, coveredInst),
                branches: this.createMetrics(totalBranch, coveredBranch),
                functions: this.createMetrics(totalMethod, coveredMethod),
                lines: this.createMetrics(totalLine, coveredLine)
            },
            files
        };
    }

    private createMetrics(total: number, covered: number): CoverageMetrics {
        return {
            total,
            covered,
            skipped: total - covered,
            pct: total > 0 ? (covered / total) * 100 : 100
        };
    }
}

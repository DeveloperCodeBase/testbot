// @ts-nocheck
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { CoverageAnalyzer } from '../CoverageAnalyzer';
import logger from '../../utils/logger';
import * as fileUtils from '../../utils/fileUtils';

jest.mock('xml2js', () => ({
    parseStringPromise: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../../utils/fileUtils', () => ({
    fileExists: jest.fn(),
    readFile: jest.fn(),
}));

type JsonJestCoverage = Record<
  string,
  {
    s: Record<string, number>;
    b: Record<string, number[]>;
    f: Record<string, number>;
    l: Record<string, number>;
  }
>;

describe('CoverageAnalyzer', () => {
    let analyzer: CoverageAnalyzer;
    const mockProjectName = 'myproject';
    const mockProjectPath = '/mock/path/myproject';

    beforeEach(() => {
        jest.clearAllMocks();
        analyzer = new CoverageAnalyzer();
    });

    describe('analyzeCoverage', () => {
        it('should log info at start', async () => {
            (fileUtils.fileExists as jest.Mock).mockResolvedValue(false);
            await analyzer.analyzeCoverage({ name: mockProjectName }, mockProjectPath);
            expect(logger.info).toHaveBeenCalledWith(`Analyzing coverage for ${mockProjectName}`);
        });

        it('should detect and parse jest coverage', async () => {
            const jestPath = path.join(mockProjectPath, 'coverage', 'coverage-final.json');
            (fileUtils.fileExists as jest.Mock)
                .mockImplementation(async (p) => p === jestPath);
            const parseJestSpy = jest.spyOn(analyzer as any, 'parseJestCoverage')
                .mockResolvedValue({ project: mockProjectName, overall: {}, files: [], timestamp: new Date().toISOString() });

            const result = await analyzer.analyzeCoverage({ name: mockProjectName }, mockProjectPath);

            expect(fileUtils.fileExists).toHaveBeenCalledWith(jestPath);
            expect(parseJestSpy).toHaveBeenCalledWith(mockProjectName, jestPath);
            expect(result).not.toBeNull();
        });

        it('should detect and parse cobertura coverage', async () => {
            const jestPath = path.join(mockProjectPath, 'coverage', 'coverage-final.json');
            const coberturaPath = path.join(mockProjectPath, 'coverage.xml');

            (fileUtils.fileExists as jest.Mock)
                .mockImplementation(async (p) => p === coberturaPath);
            jest.spyOn(analyzer as any, 'parseCoberturaCoverage').mockResolvedValue({
                project: mockProjectName,
                overall: {},
                files: [],
                timestamp: new Date().toISOString(),
            });

            const result = await analyzer.analyzeCoverage({ name: mockProjectName }, mockProjectPath);
            expect(fileUtils.fileExists).toHaveBeenCalledWith(jestPath);
            expect(fileUtils.fileExists).toHaveBeenCalledWith(coberturaPath);
            expect(result).not.toBeNull();
        });

        it('should detect and parse jacoco coverage', async () => {
            const jestPath = path.join(mockProjectPath, 'coverage', 'coverage-final.json');
            const coberturaPath = path.join(mockProjectPath, 'coverage.xml');
            const jacocoPath = path.join(mockProjectPath, 'target', 'site', 'jacoco', 'jacoco.xml');

            (fileUtils.fileExists as jest.Mock)
                .mockImplementation(async (p) => p === jacocoPath);

            jest.spyOn(analyzer as any, 'parseJacocoCoverage').mockResolvedValue({
                project: mockProjectName,
                overall: {},
                files: [],
                timestamp: new Date().toISOString(),
            });

            const result = await analyzer.analyzeCoverage({ name: mockProjectName }, mockProjectPath);
            expect(fileUtils.fileExists).toHaveBeenCalledWith(jestPath);
            expect(fileUtils.fileExists).toHaveBeenCalledWith(coberturaPath);
            expect(fileUtils.fileExists).toHaveBeenCalledWith(jacocoPath);
            expect(result).not.toBeNull();
        });

        it('should warn and return null if no coverage found', async () => {
            (fileUtils.fileExists as jest.Mock).mockResolvedValue(false);

            const result = await analyzer.analyzeCoverage({ name: mockProjectName }, mockProjectPath);

            expect(logger.warn).toHaveBeenCalledWith(`No coverage report found for ${mockProjectName}`);
            expect(result).toBeNull();
        });
    });

    describe('parseJestCoverage', () => {
        const fullReportPath = path.join(mockProjectPath, 'coverage', 'coverage-final.json');

        it('should parse Jest JSON coverage and produce valid report', async () => {
            const mockContent = JSON.stringify({
                '/src/file1.ts': {
                    s: { '1': 1, '2': 0 },
                    b: { '1': [1, 0], '2': [0, 0] },
                    f: { '1': 1 },
                    l: { '1': 1, '2': 0 }
                }
            });

            (fileUtils.readFile as jest.Mock).mockResolvedValue(mockContent);

            const result = await (analyzer as any).parseJestCoverage(mockProjectName, fullReportPath);

            expect(fileUtils.readFile).toHaveBeenCalledWith(fullReportPath);

            expect(result).not.toBeNull();
            expect(result.project).toEqual(mockProjectName);
            expect(result.files).toHaveLength(1);

            const f = result.files[0];
            expect(f.path).toBeDefined();
            expect(f.statements.total).toBe(2);
            expect(f.statements.covered).toBe(1);
            expect(f.branches.total).toBe(4);
            expect(f.branches.covered).toBe(1);
            expect(f.functions.total).toBe(1);
            expect(f.functions.covered).toBe(1);
            expect(f.lines.total).toBe(2);
            expect(f.lines.covered).toBe(1);

            expect(f.uncoveredLines).toEqual([2]);

            // overall metrics
            expect(result.overall.statements.total).toBe(2);
            expect(result.overall.branches.total).toBe(4);
            expect(result.overall.functions.total).toBe(1);
            expect(result.overall.lines.total).toBe(2);
        });

        it('should return null and warn if no coverage data', async () => {
            const mockContent = JSON.stringify({}); // no coverage data

            (fileUtils.readFile as jest.Mock).mockResolvedValue(mockContent);

            const warnSpy = jest.spyOn(logger, 'warn');

            const result = await (analyzer as any).parseJestCoverage(mockProjectName, fullReportPath);

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('contains no data'));
            expect(result).toBeNull();
        });

        it('calculateJestMetrics should handle arrays and numbers correctly', () => {
            const map = {
                'a': 0,
                'b': 1,
                'c': [0, 1, 2]
            };
            // total: 1 + 1 + 3 = 5
            // covered: b=1>0(1), c=[0,1,2] 2 covered, total covered=1+2=3 (a=0 not covered)
            const result = (analyzer as any).calculateJestMetrics(map);
            expect(result.total).toBe(5);
            expect(result.covered).toBe(3);
            expect(result.pct).toBeCloseTo((3 / 5) * 100);
            expect(result.skipped).toBe(2);
        });

        it('calculateJestLineMetrics should count covered lines', () => {
            const map = {
                '1': 1,
                '2': 0,
                '3': 5
            };
            const result = (analyzer as any).calculateJestLineMetrics(map);
            expect(result.total).toBe(3);
            expect(result.covered).toBe(2);
            expect(result.pct).toBeCloseTo((2 / 3) * 100);
            expect(result.skipped).toBe(1);
        });
    });

    describe('parseCoberturaCoverage', () => {
        const coberturaPath = path.join(mockProjectPath, 'coverage.xml');

        it('should parse valid cobertura XML and gather coverage info', async () => {
            const coberturaXml = `
                <coverage>
                    <packages>
                        <package name="pkg1">
                            <classes>
                                <class filename="file1.ts">
                                    <lines>
                                        <line number="1" hits="1" branch="true" condition-coverage="50% (1/2)"/>
                                        <line number="2" hits="0" branch="true" condition-coverage="0% (0/1)"/>
                                        <line number="3" hits="0" branch="false"/>
                                    </lines>
                                </class>
                            </classes>
                        </package>
                    </packages>
                </coverage>
            `;

            (fileUtils.readFile as jest.Mock).mockResolvedValue(coberturaXml);
            (parseStringPromise as jest.Mock).mockResolvedValue({
                coverage: {
                    packages: [{
                        package: [{
                            $: { name: 'pkg1' },
                            classes: [{
                                class: [{
                                    $: { filename: 'file1.ts' },
                                    lines: [{
                                        line: [
                                            { $: { number: '1', hits: '1', branch: 'true', 'condition-coverage': '50% (1/2)' } },
                                            { $: { number: '2', hits: '0', branch: 'true', 'condition-coverage': '0% (0/1)' } },
                                            { $: { number: '3', hits: '0', branch: 'false' } }
                                        ]
                                    }]
                                }]
                            }]
                        }]
                    }]
                }
            });

            const result = await (analyzer as any).parseCoberturaCoverage(mockProjectName, coberturaPath);

            expect(fileUtils.readFile).toHaveBeenCalledWith(coberturaPath);
            expect(parseStringPromise).toHaveBeenCalled();

            expect(result.project).toBe(mockProjectName);
            expect(result.files).toHaveLength(1);
            const fileCov = result.files[0];

            // Statements treated as lines totals and coverage
            expect(fileCov.statements.total).toBe(3);
            expect(fileCov.statements.covered).toBe(1);
            expect(fileCov.branches.total).toBe(3);
            expect(fileCov.branches.covered).toBe(1);
            expect(fileCov.functions.total).toBe(0);

            expect(fileCov.uncoveredLines).toEqual([2, 3]);

            // Overall coverage
            expect(result.overall.statements.total).toBe(3);
            expect(result.overall.statements.covered).toBe(1);
            expect(result.overall.branches.total).toBe(3);
            expect(result.overall.branches.covered).toBe(1);
        });

        it('should handle no packages gracefully', async () => {
            (fileUtils.readFile as jest.Mock).mockResolvedValue('<coverage></coverage>');
            (parseStringPromise as jest.Mock).mockResolvedValue({ coverage: {} });

            const result = await (analyzer as any).parseCoberturaCoverage(mockProjectName, coberturaPath);
            expect(result.files).toHaveLength(0);
            expect(result.overall.statements.total).toBe(0);
            expect(result.overall.branches.total).toBe(0);
        });
    });

    describe('parseJacocoCoverage', () => {
        const jacocoPath = path.join(mockProjectPath, 'target', 'site', 'jacoco', 'jacoco.xml');

        it('should parse valid jacoco XML and produce coverage data', async () => {
            // Example jacoco-like XML structure parsed to JS object
            const jacocoObj = {
                report: {
                    package: [{
                        $: { name: 'my/package' },
                        sourcefile: [{
                            $: { name: 'File1.java' },
                            counter: [
                                { $: { type: 'INSTRUCTION', missed: '10', covered: '90' }},
                                { $: { type: 'BRANCH', missed: '3', covered: '7' }},
                                { $: { type: 'LINE', missed: '5', covered: '15' }},
                                { $: { type: 'METHOD', missed: '2', covered: '8' }}
                            ],
                            line: [
                                { $: { nr: '1', mi: '0', ci: '3' }},
                                { $: { nr: '2', mi: '2', ci: '0' }},
                                { $: { nr: '3', mi: '1', ci: '0' }}
                            ]
                        }]
                    }]
                }
            };

            (fileUtils.readFile as jest.Mock).mockResolvedValue('<xml/>');
            (parseStringPromise as jest.Mock).mockResolvedValue(jacocoObj);

            const result = await (analyzer as any).parseJacocoCoverage(mockProjectName, jacocoPath);
            expect(fileUtils.readFile).toHaveBeenCalledWith(jacocoPath);
            expect(parseStringPromise).toHaveBeenCalled();

            expect(result.project).toBe(mockProjectName);
            expect(result.files).toHaveLength(1);

            const fileCov = result.files[0];

            const expectedPath = path.join('my/package', 'File1.java');
            expect(fileCov.path).toBe(expectedPath);
            expect(fileCov.statements.total).toBe(100); // 10 + 90
            expect(fileCov.statements.covered).toBe(90);

            expect(fileCov.branches.total).toBe(10); // 3 + 7
            expect(fileCov.branches.covered).toBe(7);

            expect(fileCov.lines.total).toBe(20); // 5 + 15
            expect(fileCov.lines.covered).toBe(15);

            expect(fileCov.functions.total).toBe(10); // 2 + 8
            expect(fileCov.functions.covered).toBe(8);

            // Uncovered lines from line elements ci=0 means no coverage
            expect(fileCov.uncoveredLines).toEqual([2, 3]);

            // Overall metrics
            expect(result.overall.statements.total).toBe(100);
            expect(result.overall.branches.covered).toBe(7);
            expect(result.overall.functions.total).toBe(10);
            expect(result.overall.lines.covered).toBe(15);
        });

        it('should handle empty packages gracefully', async () => {
            (fileUtils.readFile as jest.Mock).mockResolvedValue('<xml/>');
            (parseStringPromise as jest.Mock).mockResolvedValue({ report: {} });

            const result = await (analyzer as any).parseJacocoCoverage(mockProjectName, jacocoPath);
            expect(result.files).toHaveLength(0);
            expect(result.overall.statements.total).toBe(0);
            expect(result.overall.branches.total).toBe(0);
            expect(result.overall.functions.total).toBe(0);
            expect(result.overall.lines.total).toBe(0);
        });
    });

    describe('createMetrics', () => {
        it('should produce coverage metrics with pct and skipped', () => {
            const metrics = (analyzer as any).createMetrics(10, 7);
            expect(metrics.total).toBe(10);
            expect(metrics.covered).toBe(7);
            expect(metrics.skipped).toBe(3);
            expect(metrics.pct).toBeCloseTo(70);
        });

        it('should handle total=0 producing 100% coverage by default', () => {
            const metrics = (analyzer as any).createMetrics(0, 0);
            expect(metrics.total).toBe(0);
            expect(metrics.covered).toBe(0);
            expect(metrics.skipped).toBe(0);
            expect(metrics.pct).toBe(100);
        });
    });
});
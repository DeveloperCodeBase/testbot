// @ts-nocheck
import path from 'path';
import { CoverageAnalyzer } from '../CoverageAnalyzer';
import * as fileUtils from '../../utils/fileUtils';
import * as logger from '../../utils/logger';
import { parseStringPromise } from 'xml2js';

jest.mock('../../utils/fileUtils');
jest.mock('../../utils/logger');
jest.mock('xml2js', () => ({
    parseStringPromise: jest.fn()
}));

// Helpers for JSON mocking and xml mocking
const fakeProjectName = 'TestProject';
const fakeProjectPath = '/fake/project/path';

// A helper to build jest JSON coverage map style
function buildJestCoverageMap(statements = {}, branches = {}, functions = {}, lines = {}) {
    return {
        s: statements,
        b: branches,
        f: functions,
        l: lines
    };
}

describe('CoverageAnalyzer', () => {
    let analyzer: CoverageAnalyzer;
    const loggerInfoSpy = jest.spyOn(logger.default, 'info').mockImplementation(() => { });
    const loggerWarnSpy = jest.spyOn(logger.default, 'warn').mockImplementation(() => { });

    beforeEach(() => {
        analyzer = new CoverageAnalyzer();
        jest.clearAllMocks();
    });

    describe('analyzeCoverage', () => {
        it('should parse Jest coverage if coverage-final.json exists', async () => {
            (fileUtils.fileExists as jest.Mock).mockImplementation(async (p) => {
                return p.endsWith('coverage-final.json');
            });
            (fileUtils.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({
                    'src/index.ts': buildJestCoverageMap(
                        { 1: 1, 2: 0 },
                        { 1: [1, 0], 2: [0, 0] },
                        { 1: 1, 2: 0 },
                        { 1: 1, 2: 0 }
                    )
                })
            );

            const report = await analyzer.analyzeCoverage({ name: fakeProjectName }, fakeProjectPath);

            expect(report).not.toBeNull();
            expect(report?.project).toBe(fakeProjectName);
            expect(loggerInfoSpy).toHaveBeenCalledWith(`Analyzing coverage for ${fakeProjectName}`);
            expect(report?.files[0].uncoveredLines).toEqual([2]);
        });

        it('should parse Cobertura coverage if coverage.xml exists and Jest report does not', async () => {
            (fileUtils.fileExists as jest.Mock).mockImplementation(async (p) => {
                if (p.endsWith('coverage-final.json')) return false;
                if (p.endsWith('coverage.xml')) return true;
                return false;
            });
            const coberturaXml = `
                <coverage>
                    <packages>
                        <package>
                            <classes>
                                <class filename="foo.ts">
                                    <lines>
                                        <line number="1" hits="1" branch="true" condition-coverage="50% (1/2)"/>
                                        <line number="2" hits="0" branch="true" condition-coverage="0% (0/1)"/>
                                        <line number="3" hits="1" branch="false" />
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
                    packages: [
                        {
                            package: [
                                {
                                    classes: [
                                        {
                                            class: [
                                                {
                                                    $: { filename: 'foo.ts' },
                                                    lines: [
                                                        {
                                                            line: [
                                                                { $: { number: '1', hits: '1', branch: 'true', 'condition-coverage': '50% (1/2)' } },
                                                                { $: { number: '2', hits: '0', branch: 'true', 'condition-coverage': '0% (0/1)' } },
                                                                { $: { number: '3', hits: '1', branch: 'false' } }
                                                            ]
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            });

            const report = await analyzer.analyzeCoverage({ name: fakeProjectName }, fakeProjectPath);

            expect(report).not.toBeNull();
            expect(report?.overall.branches.covered).toBe(1);
            expect(report?.overall.branches.total).toBe(3); // From condition coverage: (1/2 + 0/1) = 3 total branches
            expect(report?.files[0].uncoveredLines).toEqual([2]);
        });

        it('should parse Jacoco coverage if jacoco.xml exists and other reports do not', async () => {
            (fileUtils.fileExists as jest.Mock).mockImplementation(async (p) => {
                if (p.endsWith('coverage-final.json')) return false;
                if (p.endsWith('coverage.xml')) return false;
                if (p.endsWith(path.join('target', 'site', 'jacoco', 'jacoco.xml'))) return true;
                return false;
            });

            const jacocoXml = `
                <report>
                    <package name="pkg">
                        <sourcefile name="file.ts">
                            <counter type="INSTRUCTION" missed="2" covered="3"/>
                            <counter type="BRANCH" missed="1" covered="1"/>
                            <counter type="LINE" missed="1" covered="4"/>
                            <counter type="METHOD" missed="0" covered="2"/>
                            <line nr="12" mi="0" ci="0"/>
                            <line nr="13" mi="0" ci="3"/>
                            <line nr="14" mi="1" ci="0"/>
                        </sourcefile>
                    </package>
                </report>
            `;

            (fileUtils.readFile as jest.Mock).mockResolvedValue(jacocoXml);
            (parseStringPromise as jest.Mock).mockResolvedValue({
                report: {
                    package: [
                        {
                            $: { name: 'pkg' },
                            sourcefile: [
                                {
                                    $: { name: 'file.ts' },
                                    counter: [
                                        { $: { type: 'INSTRUCTION', missed: '2', covered: '3' } },
                                        { $: { type: 'BRANCH', missed: '1', covered: '1' } },
                                        { $: { type: 'LINE', missed: '1', covered: '4' } },
                                        { $: { type: 'METHOD', missed: '0', covered: '2' } }
                                    ],
                                    line: [
                                        { $: { nr: '12', mi: '0', ci: '0' } }, // uncovered line (ci=0)
                                        { $: { nr: '13', mi: '0', ci: '3' } }, // covered line
                                        { $: { nr: '14', mi: '1', ci: '0' } }  // uncovered line (mi>0, ci=0)
                                    ]
                                }
                            ]
                        }
                    ]
                }
            });

            const report = await analyzer.analyzeCoverage({ name: fakeProjectName }, fakeProjectPath);

            expect(report).not.toBeNull();
            expect(report?.overall.statements.total).toBe(5);
            expect(report?.overall.statements.covered).toBe(3);
            expect(report?.files[0].uncoveredLines).toEqual([12, 14]);
        });

        it('should return null and warn if no coverage reports are found', async () => {
            (fileUtils.fileExists as jest.Mock).mockResolvedValue(false);

            const report = await analyzer.analyzeCoverage({ name: fakeProjectName }, fakeProjectPath);

            expect(report).toBeNull();
            expect(loggerWarnSpy).toHaveBeenCalledWith(`No coverage report found for ${fakeProjectName}`);
        });
    });

    describe('parseJestCoverage', () => {
        it('should return null if no coverage data is available (all totals 0)', async () => {
            const emptyReportPath = '/any/path/coverage-final.json';
            (fileUtils.readFile as jest.Mock).mockResolvedValue('{}');

            const result = await (analyzer as any).parseJestCoverage(fakeProjectName, emptyReportPath);

            expect(result).toBeNull();
            expect(loggerWarnSpy).toHaveBeenCalledWith(`Coverage report exists but contains no data for ${fakeProjectName}`);
        });

        it('should correctly calculate metrics and uncovered lines', async () => {
            const reportPath = '/project/coverage/coverage-final.json';
            const jsonContent = JSON.stringify({
                '/project/src/file1.ts': {
                    s: { '1': 1, '2': 0, '3': 3 },
                    b: { '1': [0, 1], '2': [0, 0] },
                    f: { '1': 1, '2': 0 },
                    l: { '1': 1, '2': 0 }
                }
            });
            (fileUtils.readFile as jest.Mock).mockResolvedValue(jsonContent);

            const report = await (analyzer as any).parseJestCoverage(fakeProjectName, reportPath);

            expect(report).not.toBeNull();
            expect(report.files.length).toBe(1);
            const fileCov = report.files[0];
            expect(fileCov.statements.total).toBe(3);
            expect(fileCov.statements.covered).toBe(2);
            expect(fileCov.branches.total).toBe(4);
            expect(fileCov.branches.covered).toBe(1);
            expect(fileCov.functions.total).toBe(2);
            expect(fileCov.functions.covered).toBe(1);
            expect(fileCov.lines.total).toBe(2);
            expect(fileCov.lines.covered).toBe(1);
            expect(fileCov.uncoveredLines).toEqual([2]);
        });
    });

    describe('calculateJestMetrics', () => {
        it('should handle map of numbers and arrays correctly', () => {
            const map = {
                a: 1,
                b: 0,
                c: [0, 1, 1, 0],
                d: [0, 0]
            };
            const metrics = (analyzer as any).calculateJestMetrics(map);
            expect(metrics.total).toBe(8); // 1+1+4+2 = 8 (a, b are numbers=1 each, c has 4 elements, d has 2)
            expect(metrics.covered).toBe(3); // a=1, b=0, c=2 covered, d=0 covered
        });

        it('should return zero metrics for empty map', () => {
            const metrics = (analyzer as any).calculateJestMetrics({});
            expect(metrics).toEqual({
                total: 0,
                covered: 0,
                skipped: 0,
                pct: 0
            });
        });
    });

    describe('calculateJestLineMetrics', () => {
        it('should calculate correct line coverage from map', () => {
            const map = { '1': 1, '2': 0, '3': 5 };
            const metrics = (analyzer as any).calculateJestLineMetrics(map);
            expect(metrics.total).toBe(3);
            expect(metrics.covered).toBe(2);
        });

        it('should handle empty map', () => {
            const metrics = (analyzer as any).calculateJestLineMetrics({});
            expect(metrics).toEqual({
                total: 0,
                covered: 0,
                skipped: 0,
                pct: 0
            });
        });
    });

    describe('parseCoberturaCoverage', () => {
        it('should parse basic Cobertura XML correctly', async () => {
            const xml = `<coverage>
                <packages>
                    <package>
                        <classes>
                            <class filename="f.ts">
                                <lines>
                                    <line number="1" hits="1" branch="true" condition-coverage="100% (2/2)"/>
                                    <line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/>
                                    <line number="3" hits="0" branch="false"/>
                                </lines>
                            </class>
                        </classes>
                    </package>
                </packages>
            </coverage>`;
            (fileUtils.readFile as jest.Mock).mockResolvedValue(xml);
            (parseStringPromise as jest.Mock).mockResolvedValue({
                coverage: {
                    packages: [
                        {
                            package: [
                                {
                                    classes: [
                                        {
                                            class: [
                                                {
                                                    $: { filename: 'f.ts' },
                                                    lines: [
                                                        {
                                                            line: [
                                                                { $: { number: '1', hits: '1', branch: 'true', 'condition-coverage': '100% (2/2)' } },
                                                                { $: { number: '2', hits: '0', branch: 'true', 'condition-coverage': '50% (1/2)' } },
                                                                { $: { number: '3', hits: '0', branch: 'false' } }
                                                            ]
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            });

            const report = await (analyzer as any).parseCoberturaCoverage(fakeProjectName, '/path/to/coverage.xml');

            expect(report).not.toBeNull();
            expect(report.files[0].uncoveredLines).toEqual([2, 3]);
            expect(report.overall.branches.total).toBe(4); // 2 + 2 from condition-coverage
            expect(report.overall.branches.covered).toBe(3); // 2 + 1
        });

        it('should handle missing packages gracefully', async () => {
            (fileUtils.readFile as jest.Mock).mockResolvedValue('<coverage></coverage>');
            (parseStringPromise as jest.Mock).mockResolvedValue({ coverage: {} });

            const report = await (analyzer as any).parseCoberturaCoverage(fakeProjectName, 'path');

            expect(report.files).toEqual([]);
            expect(report.overall.statements.total).toEqual(0);
        });
    });

    describe('parseJacocoCoverage', () => {
        it('should handle no packages gracefully', async () => {
            (fileUtils.readFile as jest.Mock).mockResolvedValue('<report></report>');
            (parseStringPromise as jest.Mock).mockResolvedValue({ report: {} });

            const report = await (analyzer as any).parseJacocoCoverage(fakeProjectName, 'path');

            expect(report.files).toEqual([]);
            expect(report.overall.statements.total).toEqual(0);
        });

        it('should parse counters and uncovered lines correctly', async () => {
            const xml = `<report>
                <package name="pkg1">
                    <sourcefile name="sf1.ts">
                        <counter type="INSTRUCTION" missed="1" covered="4"/>
                        <counter type="BRANCH" missed="2" covered="3"/>
                        <counter type="LINE" missed="1" covered="4"/>
                        <counter type="METHOD" missed="0" covered="2"/>
                        <line nr="10" mi="0" ci="0"/>
                        <line nr="11" mi="0" ci="5"/>
                        <line nr="12" mi="1" ci="0"/>
                    </sourcefile>
                </package>
            </report>`;
            (fileUtils.readFile as jest.Mock).mockResolvedValue(xml);
            (parseStringPromise as jest.Mock).mockResolvedValue({
                report: {
                    package: [
                        {
                            $: { name: 'pkg1' },
                            sourcefile: [
                                {
                                    $: { name: 'sf1.ts' },
                                    counter: [
                                        { $: { type: 'INSTRUCTION', missed: '1', covered: '4' } },
                                        { $: { type: 'BRANCH', missed: '2', covered: '3' } },
                                        { $: { type: 'LINE', missed: '1', covered: '4' } },
                                        { $: { type: 'METHOD', missed: '0', covered: '2' } }
                                    ],
                                    line: [
                                        { $: { nr: '10', mi: '0', ci: '0' } },
                                        { $: { nr: '11', mi: '0', ci: '5' } },
                                        { $: { nr: '12', mi: '1', ci: '0' } }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            });

            const report = await (analyzer as any).parseJacocoCoverage(fakeProjectName, '/path/jacoco.xml');

            expect(report.files[0].path).toBe(path.join('pkg1', 'sf1.ts'));
            expect(report.files[0].statements.total).toBe(5);
            expect(report.files[0].statements.covered).toBe(4);
            expect(report.files[0].branches.total).toBe(5);
            expect(report.files[0].branches.covered).toBe(3);
            expect(report.files[0].functions.total).toBe(2);
            expect(report.files[0].functions.covered).toBe(2);
            expect(report.files[0].lines.total).toBe(5);
            expect(report.files[0].lines.covered).toBe(4);

            // uncovered lines with ci=0: 10, 12
            expect(report.files[0].uncoveredLines).toEqual([10, 12]);
        });
    });

    describe('createMetrics', () => {
        it('should create correct metrics with non-zero total', () => {
            const result = (analyzer as any).createMetrics(10, 5);
            expect(result).toEqual({
                total: 10,
                covered: 5,
                skipped: 5,
                pct: 50
            });
        });

        it('should handle zero total', () => {
            const result = (analyzer as any).createMetrics(0, 0);
            expect(result).toEqual({
                total: 0,
                covered: 0,
                skipped: 0,
                pct: 0
            });
        });
    });
});
// @ts-nocheck
import path from 'path';
import { PythonAdapter } from '../PythonAdapter';
import { ProjectDescriptor } from '../../models/ProjectDescriptor';
import { readFile } from '../../utils/fileUtils';

jest.mock('../../utils/fileUtils');

describe('PythonAdapter', () => {
    let adapter: PythonAdapter;
    const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

    beforeEach(() => {
        adapter = new PythonAdapter();
        jest.clearAllMocks();
    });

    describe('fields', () => {
        it('should set language to python', () => {
            expect(adapter.language).toBe('python');
        });
    });

    describe('canHandle', () => {
        it('returns true if project.language is python', () => {
            const project: ProjectDescriptor = { language: 'python' } as any;
            expect(adapter.canHandle(project)).toBe(true);
        });

        it('returns false if project.language is not python', () => {
            const project: ProjectDescriptor = { language: 'javascript' } as any;
            expect(adapter.canHandle(project)).toBe(false);
        });

        it('returns false if project.language is undefined', () => {
            const project = {} as ProjectDescriptor;
            expect(adapter.canHandle(project)).toBe(false);
        });
    });

    describe('getTestFramework', () => {
        it('returns project.testFramework if defined', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'unittest' } as any;
            expect(adapter.getTestFramework(project)).toBe('unittest');
        });
        it('defaults to pytest if project.testFramework is undefined', () => {
            const project: ProjectDescriptor = { language: 'python' } as any;
            expect(adapter.getTestFramework(project)).toBe('pytest');
        });
    });

    describe('getBuildCommand', () => {
        it('returns the expected venv setup command', () => {
            const project: ProjectDescriptor = { language: 'python' } as any;
            expect(adapter.getBuildCommand(project)).toBe(
                'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt || echo "Requirements install failed but continuing"',
            );
        });
    });

    describe('getTestCommand', () => {
        const basePythonExec = './.venv/bin/python';

        it('returns correct pytest command for unit tests', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'pytest' } as any;
            const cmd = adapter.getTestCommand(project, 'unit');
            expect(cmd).toBe(`${basePythonExec} -m pytest tests/unit -v`);
        });

        it('returns correct pytest command for integration tests', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'pytest' } as any;
            const cmd = adapter.getTestCommand(project, 'integration');
            expect(cmd).toBe(`${basePythonExec} -m pytest tests/integration -v`);
        });

        it('returns correct pytest command for e2e tests', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'pytest' } as any;
            const cmd = adapter.getTestCommand(project, 'e2e');
            expect(cmd).toBe(`${basePythonExec} -m pytest tests/e2e -v`);
        });

        it('returns unittest discover command if framework is unittest', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'unittest' } as any;
            const cmd = adapter.getTestCommand(project, 'unit');
            expect(cmd).toBe(`${basePythonExec} -m unittest discover`);
            expect(adapter.getTestCommand(project, 'integration')).toBe(`${basePythonExec} -m unittest discover`);
            expect(adapter.getTestCommand(project, 'e2e')).toBe(`${basePythonExec} -m unittest discover`);
        });

        it('falls back to pytest command if unknown framework', () => {
            const project: ProjectDescriptor = { language: 'python', testFramework: 'unknown' as any } as any;
            const cmd = adapter.getTestCommand(project, 'unit');
            expect(cmd).toBe(`${basePythonExec} -m pytest -v`);
        });
    });

    describe('getCoverageCommand', () => {
        it('returns the expected coverage command', () => {
            const project: ProjectDescriptor = { language: 'python' } as any;
            const expected = './.venv/bin/python -m pytest --cov=. --cov-report=json --cov-report=term';
            expect(adapter.getCoverageCommand(project)).toBe(expected);
        });
    });

    describe('getPythonExecutable (private)', () => {
        it('returns the venv python path', () => {
            // Access private method for coverage (though not typical)
            // @ts-expect-error accessing private
            expect(adapter.getPythonExecutable({} as ProjectDescriptor)).toBe('./.venv/bin/python');
        });
    });

    describe('getTestFilePath', () => {
        const sourceFile = 'foo.py';

        it('returns correct unit test file path', () => {
            const result = adapter.getTestFilePath(sourceFile, 'unit', {} as ProjectDescriptor);
            expect(result).toBe(path.join('tests', 'unit', 'test_foo.py'));
        });

        it('returns correct integration test file path', () => {
            const result = adapter.getTestFilePath(sourceFile, 'integration', {} as ProjectDescriptor);
            expect(result).toBe(path.join('tests', 'integration', 'test_foo.py'));
        });

        it('returns correct e2e test file path', () => {
            const result = adapter.getTestFilePath(sourceFile, 'e2e', {} as ProjectDescriptor);
            expect(result).toBe(path.join('tests', 'e2e', 'test_foo.py'));
        });

        it('returns generic test path if unknown test type (edge case)', () => {
            // @ts-expect-error testType not one of expected
            const result = adapter.getTestFilePath(sourceFile, 'other', {} as ProjectDescriptor);
            expect(result).toBe(path.join('tests', 'test_foo.py'));
        });
    });

    describe('getTestDirectory', () => {
        it('returns correct test directory for unit', () => {
            expect(adapter.getTestDirectory({} as ProjectDescriptor, 'unit')).toBe(path.join('tests', 'unit'));
        });
        it('returns correct test directory for integration', () => {
            expect(adapter.getTestDirectory({} as ProjectDescriptor, 'integration')).toBe(path.join('tests', 'integration'));
        });
        it('returns correct test directory for e2e', () => {
            expect(adapter.getTestDirectory({} as ProjectDescriptor, 'e2e')).toBe(path.join('tests', 'e2e'));
        });
    });

    describe('getTestFilePattern', () => {
        it('always returns the simple python test filename pattern', () => {
            expect(adapter.getTestFilePattern('unit')).toBe('**/test_*.py');
            expect(adapter.getTestFilePattern('integration')).toBe('**/test_*.py');
            expect(adapter.getTestFilePattern('e2e')).toBe('**/test_*.py');
        });
    });

    describe('parseCoverage', () => {
        const projectPath = '/my/project';

        it('parses coverage JSON and returns CoverageReport correctly', async () => {
            const coverageJson = JSON.stringify({
                files: {
                    'src/file1.py': {
                        summary: { num_statements: 10, covered_lines: 8, percent_covered: 80 },
                        missing_lines: [1, 2, 3],
                    },
                    'src/file2.py': {
                        summary: { num_statements: 20, covered_lines: 15, percent_covered: 75 },
                        missing_lines: [4],
                    },
                },
            });
            mockReadFile.mockResolvedValueOnce(coverageJson);

            const result = await adapter.parseCoverage('', projectPath);

            expect(mockReadFile).toHaveBeenCalledWith(path.join(projectPath, 'coverage.json'));
            expect(result.files).toHaveLength(2);
            expect(result.overall.lines.total).toBe(30);
            expect(result.overall.lines.covered).toBe(23);
            expect(result.overall.lines.percentage).toBeCloseTo((23 / 30) * 100);
            expect(result.overall.functions.total).toBe(0);
            expect(result.overall.functions.covered).toBe(0);
            expect(result.overall.functions.percentage).toBe(0);
            expect(result.overall.branches.total).toBe(0);
            expect(result.overall.branches.covered).toBe(0);
            expect(result.overall.branches.percentage).toBe(0);

            const file1 = result.files.find(f => f.path === 'src/file1.py');
            expect(file1).toBeDefined();
            expect(file1?.lines.total).toBe(10);
            expect(file1?.lines.covered).toBe(8);
            expect(file1?.lines.percentage).toBe(80);
            expect(file1?.uncoveredLines).toEqual([1, 2, 3]);

            // Functions and branches always zero as per current code
            expect(file1?.functions.total).toBe(0);
            expect(file1?.branches.total).toBe(0);

            // Timestamp is ISO string
            expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
        });

        it('handles empty coverage data gracefully', async () => {
            mockReadFile.mockResolvedValueOnce(JSON.stringify({ files: {} }));

            const result = await adapter.parseCoverage('', projectPath);

            expect(result.files).toHaveLength(0);
            expect(result.overall.lines.total).toBe(0);
            expect(result.overall.lines.covered).toBe(0);
            expect(result.overall.lines.percentage).toBe(0);
        });

        it('throws error when readFile rejects', async () => {
            mockReadFile.mockRejectedValueOnce(new Error('file not found'));

            await expect(adapter.parseCoverage('', projectPath))
                .rejects
                .toThrow(/Failed to parse coverage: Error: file not found/);
        });

        it('throws error when JSON parsing fails', async () => {
            mockReadFile.mockResolvedValueOnce('not a json');

            await expect(adapter.parseCoverage('', projectPath)).rejects.toThrow(/Failed to parse coverage: SyntaxError/);
        });
    });
});
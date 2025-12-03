// @ts-nocheck
import path from 'path';
import { PythonAdapter } from '../PythonAdapter.js';
import { ProjectDescriptor } from '../../models/ProjectDescriptor.js';
import { readFile } from '../../utils/fileUtils.js';

jest.mock('../../utils/fileUtils.js', () => ({
  readFile: jest.fn(),
}));

describe('PythonAdapter', () => {
  let adapter: PythonAdapter;

  beforeEach(() => {
    adapter = new PythonAdapter();
    jest.resetAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for python projects', () => {
      const project: ProjectDescriptor = { language: 'python' };
      expect(adapter.canHandle(project)).toBe(true);
    });

    it('should return false for non-python projects', () => {
      expect(adapter.canHandle({ language: 'javascript' })).toBe(false);
      expect(adapter.canHandle({ language: 'typescript' })).toBe(false);
      expect(adapter.canHandle({ language: '' })).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return project testFramework if set', () => {
      expect(adapter.getTestFramework({ language: 'python', testFramework: 'unittest' })).toBe('unittest');
    });

    it('should default to pytest if not set', () => {
      expect(adapter.getTestFramework({ language: 'python' })).toBe('pytest');
    });
  });

  describe('getBuildCommand', () => {
    it('should always return the venv setup command', () => {
      const result = adapter.getBuildCommand({} as ProjectDescriptor);
      expect(result).toBe(
        'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt || echo "Requirements install failed but continuing"',
      );
    });
  });

  describe('getTestCommand', () => {
    it('should return pytest commands for each testType', () => {
      const project = { testFramework: 'pytest' } as ProjectDescriptor;
      const pyExec = './.venv/bin/python';
      expect(adapter.getTestCommand(project, 'unit')).toBe(`${pyExec} -m pytest tests/unit -v`);
      expect(adapter.getTestCommand(project, 'integration')).toBe(`${pyExec} -m pytest tests/integration -v`);
      expect(adapter.getTestCommand(project, 'e2e')).toBe(`${pyExec} -m pytest tests/e2e -v`);
    });

    it('should return unittest discover command when unittest selected, ignoring testType', () => {
      const project = { testFramework: 'unittest' } as ProjectDescriptor;
      expect(adapter.getTestCommand(project, 'unit')).toBe('./.venv/bin/python -m unittest discover');
      expect(adapter.getTestCommand(project, 'integration')).toBe('./.venv/bin/python -m unittest discover');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('./.venv/bin/python -m unittest discover');
    });

    it('should fallback to pytest if unknown test framework', () => {
      const project = { testFramework: 'unknown' } as ProjectDescriptor;
      expect(adapter.getTestCommand(project, 'unit')).toBe('./.venv/bin/python -m pytest -v');
    });
  });

  describe('getCoverageCommand', () => {
    it('should return pytest coverage command with python executable', () => {
      const project = {} as ProjectDescriptor;
      expect(adapter.getCoverageCommand(project)).toBe('./.venv/bin/python -m pytest --cov=. --cov-report=json --cov-report=term');
    });
  });

  describe('getTestFilePath', () => {
    const sourceFile = 'module.py';

    it.each([
      ['unit', path.join('tests', 'unit', 'test_module.py')],
      ['integration', path.join('tests', 'integration', 'test_module.py')],
      ['e2e', path.join('tests', 'e2e', 'test_module.py')],
    ])('should return correct test file path for %s tests', (testType, expected) => {
      expect(adapter.getTestFilePath(sourceFile, testType as any, {} as ProjectDescriptor)).toBe(expected);
    });

    it('should fallback to generic test file path for unknown test type', () => {
      // @ts-expect-error testing unknown type
      expect(adapter.getTestFilePath(sourceFile, 'unknown', {} as ProjectDescriptor)).toBe(path.join('tests', 'test_module.py'));
    });
  });

  describe('getTestDirectory', () => {
    it.each([
      ['unit', path.join('tests', 'unit')],
      ['integration', path.join('tests', 'integration')],
      ['e2e', path.join('tests', 'e2e')],
    ])('should return correct test directory for %s tests', (testType, expected) => {
      expect(adapter.getTestDirectory({} as ProjectDescriptor, testType as any)).toBe(expected);
    });
  });

  describe('getTestFilePattern', () => {
    it('should always return python test file pattern', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/test_*.py');
      expect(adapter.getTestFilePattern('integration')).toBe('**/test_*.py');
      expect(adapter.getTestFilePattern('e2e')).toBe('**/test_*.py');
    });
  });

  describe('parseCoverage', () => {
    const projectPath = '/fake/python-project';
    const coverageJsonPath = path.join(projectPath, 'coverage.json');

    const mockCoverageJson = {
      files: {
        'module1.py': {
          summary: {
            num_statements: 10,
            covered_lines: 8,
            percent_covered: 80,
          },
          missing_lines: [3, 5],
        },
        'module2.py': {
          summary: {
            num_statements: 0,
            covered_lines: 0,
            percent_covered: 0,
          },
          missing_lines: [],
        },
      },
    };

    it('should parse coverage json and aggregate overall coverage', async () => {
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockCoverageJson));

      const result = await adapter.parseCoverage('', projectPath);

      // Called with json path
      expect(readFile).toHaveBeenCalledWith(coverageJsonPath);

      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual(
        expect.objectContaining({
          path: 'module1.py',
          lines: { total: 10, covered: 8, percentage: 80 },
          uncoveredLines: [3, 5],
          functions: { total: 0, covered: 0, percentage: 0 },
          branches: { total: 0, covered: 0, percentage: 0 },
        }),
      );

      // overall coverage lines should be aggregated (10 total, 8 covered)
      expect(result.overall.lines.total).toBe(10);
      expect(result.overall.lines.covered).toBe(8);
      expect(result.overall.lines.percentage).toBeCloseTo(80);

      // functions and branches are zeroed as expected
      expect(result.overall.functions).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(result.overall.branches).toEqual({ total: 0, covered: 0, percentage: 0 });

      expect(typeof result.timestamp).toBe('string');
    });

    it('should return zero coverage when no files in coverage.json', async () => {
      (readFile as jest.Mock).mockResolvedValue(JSON.stringify({ files: {} }));

      const result = await adapter.parseCoverage('', projectPath);

      expect(result.files).toHaveLength(0);
      expect(result.overall.lines).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(result.overall.functions).toEqual({ total: 0, covered: 0, percentage: 0 });
      expect(result.overall.branches).toEqual({ total: 0, covered: 0, percentage: 0 });
    });

    it('should throw error if readFile fails', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(adapter.parseCoverage('', projectPath)).rejects.toThrow('Failed to parse coverage');
    });
  });

  describe('getPythonExecutable (private)', () => {
    it('should return .venv python executable path', () => {
      expect(adapter['getPythonExecutable']({} as ProjectDescriptor)).toBe('./.venv/bin/python');
    });
  });
});
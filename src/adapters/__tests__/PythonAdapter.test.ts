import path from 'path';
import { PythonAdapter } from '../PythonAdapter.js';
import { readFile } from '../../utils/fileUtils.js';

jest.mock('../../utils/fileUtils.js', () => ({
  readFile: jest.fn(),
}));

describe('PythonAdapter', () => {
  let adapter: PythonAdapter;

  beforeEach(() => {
    adapter = new PythonAdapter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('returns true for python language', () => {
      expect(adapter.canHandle({ language: 'python' } as any)).toBe(true);
    });

    it('returns false for non-python language', () => {
      expect(adapter.canHandle({ language: 'javascript' } as any)).toBe(false);
      expect(adapter.canHandle({ language: 'java' } as any)).toBe(false);
      expect(adapter.canHandle({} as any)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('returns testFramework if set', () => {
      expect(adapter.getTestFramework({ testFramework: 'unittest' } as any)).toBe('unittest');
    });

    it('returns pytest if testFramework not set', () => {
      expect(adapter.getTestFramework({} as any)).toBe('pytest');
    });
  });

  describe('getBuildCommand', () => {
    it('returns the expected build command string', () => {
      expect(adapter.getBuildCommand({} as any)).toBe(
        'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt || echo "Requirements install failed but continuing"'
      );
    });
  });

  describe('getTestCommand', () => {
    it('should use pytest for unit, integration, e2e tests by default', () => {
      const project = {} as any;
      expect(adapter.getTestCommand(project, 'unit')).toBe('./.venv/bin/python -m pytest tests/unit -v');
      expect(adapter.getTestCommand(project, 'integration')).toBe('./.venv/bin/python -m pytest tests/integration -v');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('./.venv/bin/python -m pytest tests/e2e -v');
    });

    it('should use unittest discover for unittest framework', () => {
      const project = { testFramework: 'unittest' } as any;
      expect(adapter.getTestCommand(project, 'unit')).toBe('./.venv/bin/python -m unittest discover');
      expect(adapter.getTestCommand(project, 'integration')).toBe('./.venv/bin/python -m unittest discover');
      expect(adapter.getTestCommand(project, 'e2e')).toBe('./.venv/bin/python -m unittest discover');
    });

    it('falls back to pytest -v if unknown framework', () => {
      const project = { testFramework: 'unknown' } as any;
      expect(adapter.getTestCommand(project, 'unit')).toBe('./.venv/bin/python -m pytest -v');
    });
  });

  describe('getCoverageCommand', () => {
    it('returns correct coverage command', () => {
      const project = {} as any;
      expect(adapter.getCoverageCommand(project)).toBe(
        './.venv/bin/python -m pytest --cov=. --cov-report=json --cov-report=term'
      );
    });
  });

  describe('getTestFilePath', () => {
    it('returns correct path for unit test', () => {
      const sourceFile = 'module.py';
      const result = adapter.getTestFilePath(sourceFile, 'unit', {} as any);
      expect(result).toBe(path.join('tests', 'unit', 'test_module.py'));
    });

    it('returns correct path for integration test', () => {
      const sourceFile = 'module.py';
      const result = adapter.getTestFilePath(sourceFile, 'integration', {} as any);
      expect(result).toBe(path.join('tests', 'integration', 'test_module.py'));
    });

    it('returns correct path for e2e test', () => {
      const sourceFile = 'module.py';
      const result = adapter.getTestFilePath(sourceFile, 'e2e', {} as any);
      expect(result).toBe(path.join('tests', 'e2e', 'test_module.py'));
    });

    it('returns default pattern if unknown testType', () => {
      // @ts-expect-error testType is invalid
      const result = adapter.getTestFilePath('module.py', 'other', {} as any);
      expect(result).toBe(path.join('tests', 'test_module.py'));
    });
  });

  describe('getTestDirectory', () => {
    it('returns the expected test directories for test types', () => {
      expect(adapter.getTestDirectory({} as any, 'unit')).toBe(path.join('tests', 'unit'));
      expect(adapter.getTestDirectory({} as any, 'integration')).toBe(path.join('tests', 'integration'));
      expect(adapter.getTestDirectory({} as any, 'e2e')).toBe(path.join('tests', 'e2e'));
    });
  });

  describe('getTestFilePattern', () => {
    it('returns the correct pattern', () => {
      expect(adapter.getTestFilePattern('unit')).toBe('**/test_*.py');
      expect(adapter.getTestFilePattern('integration')).toBe('**/test_*.py');
      expect(adapter.getTestFilePattern('e2e')).toBe('**/test_*.py');
    });
  });

  describe('parseCoverage', () => {
    const projectPath = '/some/project';

    it('parses coverage JSON correctly', async () => {
      // Mock coverage JSON
      const mockCoverage = {
        files: {
          'file1.py': {
            summary: {
              num_statements: 10,
              covered_lines: 8,
              percent_covered: 80,
            },
            missing_lines: [2, 5],
          },
          'file2.py': {
            summary: {
              num_statements: 5,
              covered_lines: 5,
              percent_covered: 100,
            },
            missing_lines: [],
          },
        },
      };
      (readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockCoverage));

      const result = await adapter.parseCoverage('', projectPath);

      expect(readFile).toHaveBeenCalledWith(path.join(projectPath, 'coverage.json'));
      expect(result.files.length).toBe(2);

      const file1 = result.files.find(f => f.path === 'file1.py');
      expect(file1).toBeDefined();
      expect(file1?.lines.total).toBe(10);
      expect(file1?.lines.covered).toBe(8);
      expect(file1?.uncoveredLines).toEqual([2, 5]);

      // Overall coverage calculations
      expect(result.overall.lines.total).toBe(15);
      expect(result.overall.lines.covered).toBe(13);
      expect(result.overall.lines.percentage).toBeCloseTo((13 / 15) * 100);

      // Functions and branches should be zero as per current implementation
      expect(result.overall.functions.total).toBe(0);
      expect(result.overall.branches.covered).toBe(0);
      expect(typeof result.timestamp).toBe('string');
    });

    it('throws error if coverage JSON reading/parsing fails', async () => {
      (readFile as jest.Mock).mockRejectedValueOnce(new Error('file not found'));

      await expect(adapter.parseCoverage('', projectPath)).rejects.toThrow(/Failed to parse coverage/);
    });

    it('handles empty coverage files gracefully', async () => {
      (readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ files: {} }));

      const result = await adapter.parseCoverage('', projectPath);

      expect(result.files.length).toBe(0);
      expect(result.overall.lines.total).toBe(0);
      expect(result.overall.lines.covered).toBe(0);
      expect(result.overall.lines.percentage).toBe(0);
    });
  });
});
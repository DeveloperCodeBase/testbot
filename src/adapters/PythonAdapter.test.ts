// @ts-nocheck
import { PythonAdapter } from './PythonAdapter';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { CoverageReport, FileCoverage, CoverageSummary } from '../models/CoverageReport';
import { readFile } from '../utils/fileUtils';
import { mock } from 'jest-mock';

jest.mock('../utils/fileUtils', () => ({
  readFile: jest.fn(),
}));

describe('PythonAdapter', () => {
  let pythonAdapter: PythonAdapter;
  let mockProjectDescriptor: ProjectDescriptor;

  beforeEach(() => {
    pythonAdapter = new PythonAdapter();
    mockProjectDescriptor = {
      language: 'python',
      testFramework: 'pytest',
      path: '/path/to/project',
    };
  });

  describe('canHandle', () => {
    it('should return true if project language is python', () => {
      expect(pythonAdapter.canHandle(mockProjectDescriptor)).toBe(true);
    });

    it('should return false if project language is not python', () => {
      const nonPythonProject = { ...mockProjectDescriptor, language: 'javascript' };
      expect(pythonAdapter.canHandle(nonPythonProject)).toBe(false);
    });
  });

  describe('getTestFramework', () => {
    it('should return the project-provided test framework if defined', () => {
      const customFrameworkProject = { ...mockProjectDescriptor, testFramework: 'unittest' };
      expect(pythonAdapter.getTestFramework(customFrameworkProject)).toBe('unittest');
    });

    it('should return pytest as the default test framework if not defined', () => {
      const noFrameworkProject = { ...mockProjectDescriptor, testFramework: undefined };
      expect(pythonAdapter.getTestFramework(noFrameworkProject)).toBe('pytest');
    });
  });

  describe('getBuildCommand', () => {
    it('should return the command to create a venv and install dependencies', () => {
      expect(pythonAdapter.getBuildCommand(mockProjectDescriptor)).toBe(
        'python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt || echo "Requirements install failed but continuing"'
      );
    });
  });

  describe('getTestCommand', () => {
    it('should return the pytest test command for unit tests', () => {
      expect(pythonAdapter.getTestCommand(mockProjectDescriptor, 'unit')).toBe(
        './.venv/bin/python -m pytest tests/unit -v'
      );
    });

    it('should return the pytest test command for integration tests', () => {
      expect(pythonAdapter.getTestCommand(mockProjectDescriptor, 'integration')).toBe(
        './.venv/bin/python -m pytest tests/integration -v'
      );
    });

    it('should return the pytest test command for e2e tests', () => {
      expect(pythonAdapter.getTestCommand(mockProjectDescriptor, 'e2e')).toBe(
        './.venv/bin/python -m pytest tests/e2e -v'
      );
    });

    it('should return the unittest test command if testFramework is unittest', () => {
      const unittestProject = { ...mockProjectDescriptor, testFramework: 'unittest' };
      expect(pythonAdapter.getTestCommand(unittestProject, 'unit')).toBe(
        './.venv/bin/python -m unittest discover'
      );
    });
  });

  describe('getCoverageCommand', () => {
    it('should return the pytest coverage command', () => {
      expect(pythonAdapter.getCoverageCommand(mockProjectDescriptor)).toBe(
        './.venv/bin/python -m pytest --cov=. --cov-report=json --cov-report=term'
      );
    });
  });

  describe('getPythonExecutable', () => {
    it('should return the path to the python executable in the venv', () => {
      expect(pythonAdapter.getPythonExecutable(mockProjectDescriptor)).toBe('./.venv/bin/python');
    });
  });

  describe('getTestFilePath', () => {
    it('should return the correct test file path for unit tests', () => {
      expect(pythonAdapter.getTestFilePath('source.py', 'unit', mockProjectDescriptor)).toBe(
        'tests/unit/test_source.py'
      );
    });

    it('should return the correct test file path for integration tests', () => {
      expect(pythonAdapter.getTestFilePath('source.py', 'integration', mockProjectDescriptor)).toBe(
        'tests/integration/test_source.py'
      );
    });

    it('should return the correct test file path for e2e tests', () => {
      expect(pythonAdapter.getTestFilePath('source.py', 'e2e', mockProjectDescriptor)).toBe(
        'tests/e2e/test_source.py'
      );
    });
  });

  describe('getTestDirectory', () => {
    it('should return the correct test directory for unit tests', () => {
      expect(pythonAdapter.getTestDirectory(mockProjectDescriptor, 'unit')).toBe('tests/unit');
    });

    it('should return the correct test directory for integration tests', () => {
      expect(pythonAdapter.getTestDirectory(mockProjectDescriptor, 'integration')).toBe(
        'tests/integration'
      );
    });

    it('should return the correct test directory for e2e tests', () => {
      expect(pythonAdapter.getTestDirectory(mockProjectDescriptor, 'e2e')).toBe('tests/e2e');
    });
  });

  describe('getTestFilePattern', () => {
    it('should return the correct test file pattern', () => {
      expect(pythonAdapter.getTestFilePattern('unit')).toBe('**/test_*.py');
    });
  });

  describe('parseCoverage', () => {
    it('should parse coverage report correctly', async () => {
      const coverageContent = `{"files":{"file1.py":{"summary":{"num_statements":10,"covered_lines":8,"percent_covered":80},"missing_lines":[5,7]}}}`;
      (readFile as jest.Mock).mockResolvedValue(coverageContent);

      const expectedCoverageReport: CoverageReport = {
        overall: {
          lines: { total: 10, covered: 8, percentage: 80 },
          functions: { total: 0, covered: 0, percentage: 0 },
          branches: { total: 0, covered: 0, percentage: 0 },
        },
        files: [
          {
            path: 'file1.py',
            lines: { total: 10, covered: 8, percentage: 80 },
            functions: { total: 0, covered: 0, percentage: 0 },
            branches: { total: 0, covered: 0, percentage: 0 },
            uncoveredLines: [5, 7],
          },
        ],
        timestamp: expect.any(String),
      };

      const coverageReport = await pythonAdapter.parseCoverage('coverageOutput', '/path/to/project');
      expect(coverageReport).toEqual(expectedCoverageReport);
    });

    it('should throw an error if coverage file is missing', async () => {
      (readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(pythonAdapter.parseCoverage('coverageOutput', '/path/to/project')).rejects.toThrow(
        'Failed to parse coverage: Error: File not found'
      );
    });

    it('should throw an error if coverage file content is invalid JSON', async () => {
      (readFile as jest.Mock).mockResolvedValue('Invalid JSON');

      await expect(pythonAdapter.parseCoverage('coverageOutput', '/path/to/project')).rejects.toThrow(
        'Failed to parse coverage: SyntaxError: Unexpected token I in JSON at position 0'
      );
    });
  });
});
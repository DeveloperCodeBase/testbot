// @ts-nocheck
import { runTestBot } from '../index.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { JobOrchestrator } from '../orchestrator/JobOrchestrator.js';
import { ReportGenerator } from '../reporter/ReportGenerator.js';
import logger from '../utils/logger';

jest.mock('../config/ConfigLoader.js');
jest.mock('../orchestrator/JobOrchestrator.js');
jest.mock('../reporter/ReportGenerator.js');
jest.mock('../utils/logger.js');

describe('runTestBot', () => {
  let infoSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  it('should run the whole flow successfully and return result and reports', async () => {
    const fakeConfig = {
      output: {
        artifacts_dir: 'artifacts',
        format: ['json', 'html'],
      },
    };

    const fakeResult = {
      jobId: 'job-123',
    };

    const mockConfigLoader = ConfigLoader as jest.MockedClass<typeof ConfigLoader>;
    mockConfigLoader.prototype.load.mockResolvedValue(fakeConfig);

    const mockJobOrchestrator = JobOrchestrator as jest.MockedClass<typeof JobOrchestrator>;
    mockJobOrchestrator.prototype.execute.mockResolvedValue(fakeResult);

    const mockReportGenerator = ReportGenerator as jest.MockedClass<typeof ReportGenerator>;
    mockReportGenerator.prototype.generateReports.mockResolvedValue(['report1', 'report2']);

    const repoInput = 'my-repo';
    const configPath = '/path/to/config.json';

    const result = await runTestBot(repoInput, configPath);

    expect(infoSpy).toHaveBeenCalledWith('Starting test bot...');
    expect(mockConfigLoader.prototype.load).toHaveBeenCalledWith(configPath);
    expect(mockJobOrchestrator.prototype.execute).toHaveBeenCalledWith(repoInput);

    expect(mockReportGenerator.prototype.generateReports).toHaveBeenCalledWith(
      fakeResult,
      'artifacts/job-123',
      ['json', 'html']
    );

    expect(infoSpy).toHaveBeenCalledWith('Test bot completed successfully');

    expect(result).toEqual({
      result: fakeResult,
      reports: ['report1', 'report2'],
    });
  });

  it('should handle errors and log them', async () => {
    const error = new Error('fail error');
    (ConfigLoader as jest.MockedClass<typeof ConfigLoader>).prototype.load.mockRejectedValue(error);

    await expect(runTestBot('repo')).rejects.toThrow(error);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Test bot failed:'));
  });

  it('should call ConfigLoader.load without configPath if not provided', async () => {
    const fakeConfig = {
      output: {
        artifacts_dir: 'dir',
        format: ['json'],
      },
    };

    (ConfigLoader as jest.MockedClass<typeof ConfigLoader>).prototype.load.mockResolvedValue(fakeConfig);
    (JobOrchestrator as jest.MockedClass<typeof JobOrchestrator>).prototype.execute.mockResolvedValue({ jobId: 'id' });
    (ReportGenerator as jest.MockedClass<typeof ReportGenerator>).prototype.generateReports.mockResolvedValue([]);

    await runTestBot('repo');

    expect(ConfigLoader.prototype.load).toHaveBeenCalledWith(undefined);
  });

  it('should respect types for output.format and forward them correctly', async () => {
    const fakeConfig = {
      output: {
        artifacts_dir: 'dir',
        format: ['json'], // can only be 'json' | 'html'
      },
    };

    (ConfigLoader as jest.MockedClass<typeof ConfigLoader>).prototype.load.mockResolvedValue(fakeConfig);
    (JobOrchestrator as jest.MockedClass<typeof JobOrchestrator>).prototype.execute.mockResolvedValue({ jobId: 'id' });
    (ReportGenerator as jest.MockedClass<typeof ReportGenerator>).prototype.generateReports.mockResolvedValue([]);

    await runTestBot('repo');

    expect(ReportGenerator.prototype.generateReports).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      ['json']
    );
  });
});
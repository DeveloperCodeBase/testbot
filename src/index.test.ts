// @ts-nocheck
import { runTestBot } from './index';
import { ConfigLoader } from './config/ConfigLoader';
import { JobOrchestrator } from './orchestrator/JobOrchestrator';
import { ReportGenerator } from './reporter/ReportGenerator';
import logger from './utils/logger';

jest.mock('./config/ConfigLoader');
jest.mock('./orchestrator/JobOrchestrator');
jest.mock('./reporter/ReportGenerator');
jest.mock('./utils/logger');

describe('runTestBot', () => {
  const mockRepoInput = 'https://github.com/user/repo.git';
  const mockConfigPath = '/path/to/config.yaml';

  let configLoaderMockInstance: jest.Mocked<ConfigLoader>;
  let jobOrchestratorMockInstance: jest.Mocked<JobOrchestrator>;
  let reportGeneratorMockInstance: jest.Mocked<ReportGenerator>;

  beforeEach(() => {
    jest.resetAllMocks();

    // Setup ConfigLoader mock
    configLoaderMockInstance = new ConfigLoader() as jest.Mocked<ConfigLoader>;
    (ConfigLoader as jest.Mock).mockReturnValue(configLoaderMockInstance);

    // Setup JobOrchestrator mock
    jobOrchestratorMockInstance = new JobOrchestrator({}) as jest.Mocked<JobOrchestrator>;
    (JobOrchestrator as jest.Mock).mockReturnValue(jobOrchestratorMockInstance);

    // Setup ReportGenerator mock
    reportGeneratorMockInstance = new ReportGenerator() as jest.Mocked<ReportGenerator>;
    (ReportGenerator as jest.Mock).mockReturnValue(reportGeneratorMockInstance);
  });

  it('should run the test bot successfully and return results and reports', async () => {
    const mockConfig = {
      output: {
        artifacts_dir: '/artifacts',
        format: ['json', 'html'],
      },
    };
    const mockResult = {
      jobId: 'job-123',
      some: 'data',
    };
    const mockReports = [
      { type: 'json', path: '/artifacts/job-123/report.json' },
      { type: 'html', path: '/artifacts/job-123/report.html' },
    ];

    configLoaderMockInstance.load.mockResolvedValueOnce(mockConfig);
    jobOrchestratorMockInstance.execute.mockResolvedValueOnce(mockResult);
    reportGeneratorMockInstance.generateReports.mockResolvedValueOnce(mockReports);

    const response = await runTestBot(mockRepoInput, mockConfigPath);

    expect(configLoaderMockInstance.load).toHaveBeenCalledTimes(1);
    expect(configLoaderMockInstance.load).toHaveBeenCalledWith(mockConfigPath);

    expect(jobOrchestratorMockInstance.execute).toHaveBeenCalledTimes(1);
    expect(jobOrchestratorMockInstance.execute).toHaveBeenCalledWith(mockRepoInput);

    const expectedOutputDir = `${mockConfig.output.artifacts_dir}/${mockResult.jobId}`;
    expect(reportGeneratorMockInstance.generateReports).toHaveBeenCalledTimes(1);
    expect(reportGeneratorMockInstance.generateReports).toHaveBeenCalledWith(
      mockResult,
      expectedOutputDir,
      mockConfig.output.format
    );

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');
    expect(logger.error).not.toHaveBeenCalled();

    expect(response).toEqual({ result: mockResult, reports: mockReports });
  });

  it('should handle error thrown during config loading and log error', async () => {
    const mockError = new Error('Failed to load config');
    configLoaderMockInstance.load.mockRejectedValueOnce(mockError);

    await expect(runTestBot(mockRepoInput, mockConfigPath)).rejects.toThrow(mockError);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${mockError}`);
  });

  it('should handle error thrown during job execution and log error', async () => {
    const mockConfig = {
      output: { artifacts_dir: 'dir', format: ['json'] },
    };
    const mockError = new Error('Job failed');

    configLoaderMockInstance.load.mockResolvedValueOnce(mockConfig);
    jobOrchestratorMockInstance.execute.mockRejectedValueOnce(mockError);

    await expect(runTestBot(mockRepoInput)).rejects.toThrow(mockError);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${mockError}`);
  });

  it('should handle error thrown during report generation and log error', async () => {
    const mockConfig = {
      output: { artifacts_dir: 'dir', format: ['json'] },
    };
    const mockResult = { jobId: 'id' };
    const mockError = new Error('Report generation failed');

    configLoaderMockInstance.load.mockResolvedValueOnce(mockConfig);
    jobOrchestratorMockInstance.execute.mockResolvedValueOnce(mockResult);
    reportGeneratorMockInstance.generateReports.mockRejectedValueOnce(mockError);

    await expect(runTestBot(mockRepoInput)).rejects.toThrow(mockError);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${mockError}`);
  });

  it('should call ConfigLoader.load with undefined configPath if none provided', async () => {
    const mockConfig = {
      output: {
        artifacts_dir: 'dir',
        format: ['json'],
      },
    };
    const mockResult = { jobId: 'id' };
    const mockReports: any[] = [];

    configLoaderMockInstance.load.mockResolvedValueOnce(mockConfig);
    jobOrchestratorMockInstance.execute.mockResolvedValueOnce(mockResult);
    reportGeneratorMockInstance.generateReports.mockResolvedValueOnce(mockReports);

    await runTestBot(mockRepoInput);

    expect(configLoaderMockInstance.load).toHaveBeenCalledWith(undefined);
  });
});
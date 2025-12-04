// @ts-nocheck
import { runTestBot } from '../index';
import { ConfigLoader } from '../config/ConfigLoader';
import { JobOrchestrator } from '../orchestrator/JobOrchestrator';
import { ReportGenerator } from '../reporter/ReportGenerator';
import logger from '../utils/logger';

jest.mock('../config/ConfigLoader');
jest.mock('../orchestrator/JobOrchestrator');
jest.mock('../reporter/ReportGenerator');
jest.mock('../utils/logger');

describe('runTestBot', () => {
  const mockConfig = {
    output: {
      artifacts_dir: '/tmp/artifacts',
      format: ['json', 'html'],
    },
  };
  const mockResult = {
    jobId: 'job-123',
  };
  const mockReports = ['report1', 'report2'];

  beforeEach(() => {
    jest.clearAllMocks();

    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockResolvedValue(mockConfig),
    }));

    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockResolvedValue(mockResult),
    }));

    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: jest.fn().mockResolvedValue(mockReports),
    }));

    (logger.info as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});
  });

  it('should run whole process and return result and reports', async () => {
    const repoInput = 'git@github.com:test/repo.git';
    const configPath = '/path/to/config.yaml';

    const ret = await runTestBot(repoInput, configPath);

    expect(ConfigLoader).toHaveBeenCalledTimes(1);
    expect(JobOrchestrator).toHaveBeenCalledTimes(1);
    expect(ReportGenerator).toHaveBeenCalledTimes(1);

    // ConfigLoader.load called with configPath
    const loaderInstance = (ConfigLoader as jest.Mock).mock.results[0].value;
    expect(loaderInstance.load).toHaveBeenCalledWith(configPath);

    // JobOrchestrator.execute called with repoInput
    const orchestratorInstance = (JobOrchestrator as jest.Mock).mock.results[0].value;
    expect(orchestratorInstance.execute).toHaveBeenCalledWith(repoInput);

    // ReportGenerator.generateReports called with correct arguments
    const reportGenInstance = (ReportGenerator as jest.Mock).mock.results[0].value;
    expect(reportGenInstance.generateReports).toHaveBeenCalledWith(
      mockResult,
      `${mockConfig.output.artifacts_dir}/${mockResult.jobId}`,
      mockConfig.output.format
    );

    expect(ret).toEqual({
      result: mockResult,
      reports: mockReports,
    });
    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should throw and log error if config loading fails', async () => {
    const error = new Error('Failed to load config');
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot('repo')).rejects.toThrow(error);

    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should throw and log error if orchestrator execute fails', async () => {
    const error = new Error('Execute failed');
    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot('repo')).rejects.toThrow(error);

    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should throw and log error if report generation fails', async () => {
    const error = new Error('Report generation failed');
    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot('repo')).rejects.toThrow(error);

    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should handle optional configPath correctly when undefined', async () => {
    await runTestBot('repo');

    const loaderInstance = (ConfigLoader as jest.Mock).mock.results[0].value;
    expect(loaderInstance.load).toHaveBeenCalledWith(undefined);
  });
});
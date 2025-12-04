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
  const repoInput = 'some/repo';
  const configPath = '/path/to/config';
  const dummyConfig = {
    output: {
      artifacts_dir: 'artifacts',
      format: ['json', 'html'],
    },
  };
  const dummyResult = {
    jobId: 'job123',
  };
  const dummyReports = ['report1', 'report2'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run entire flow successfully and return results with reports', async () => {
    const mockLoad = jest.fn().mockResolvedValue(dummyConfig);
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: mockLoad,
    }));

    const mockExecute = jest.fn().mockResolvedValue(dummyResult);
    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: mockExecute,
    }));

    const mockGenerateReports = jest.fn().mockResolvedValue(dummyReports);
    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: mockGenerateReports,
    }));

    const result = await runTestBot(repoInput, configPath);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(mockLoad).toHaveBeenCalledWith(configPath);
    expect(mockExecute).toHaveBeenCalledWith(repoInput);
    expect(mockGenerateReports).toHaveBeenCalledWith(
      dummyResult,
      `${dummyConfig.output.artifacts_dir}/${dummyResult.jobId}`,
      dummyConfig.output.format
    );
    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');
    expect(result).toEqual({
      result: dummyResult,
      reports: dummyReports,
    });
  });

  it('should throw and log error if ConfigLoader.load fails', async () => {
    const error = new Error('Loading failed');
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow('Loading failed');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should throw and log error if JobOrchestrator.execute fails', async () => {
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockResolvedValue(dummyConfig),
    }));

    const error = new Error('Execution failed');
    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow('Execution failed');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should throw and log error if ReportGenerator.generateReports fails', async () => {
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockResolvedValue(dummyConfig),
    }));

    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockResolvedValue(dummyResult),
    }));

    const error = new Error('Report generation failed');
    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: jest.fn().mockRejectedValue(error),
    }));

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow('Report generation failed');
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });
});
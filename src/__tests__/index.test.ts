import { runTestBot } from '../index.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { JobOrchestrator } from '../orchestrator/JobOrchestrator.js';
import { ReportGenerator } from '../reporter/ReportGenerator.js';
import logger from '../utils/logger.js';

jest.mock('../config/ConfigLoader.js');
jest.mock('../orchestrator/JobOrchestrator.js');
jest.mock('../reporter/ReportGenerator.js');
jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('runTestBot', () => {
  const dummyConfig = {
    output: {
      artifacts_dir: '/tmp/artifacts',
      format: ['json', 'html'],
    },
  };
  const dummyResult = {
    jobId: 'job123',
  };
  const dummyReports = ['report1', 'report2'];
  const repoInput = 'dummyRepo';
  const configPath = '/path/to/config';

  let loadMock: jest.Mock;
  let executeMock: jest.Mock;
  let generateReportsMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    loadMock = jest.fn().mockResolvedValue(dummyConfig);
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: loadMock,
    }));

    generateReportsMock = jest.fn().mockResolvedValue(dummyReports);
    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: generateReportsMock,
    }));

    executeMock = jest.fn().mockResolvedValue(dummyResult);
    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: executeMock,
    }));
  });

  it('should run test bot flow correctly and return result and reports', async () => {
    const result = await runTestBot(repoInput, configPath);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(ConfigLoader).toHaveBeenCalledTimes(1);
    expect(loadMock).toHaveBeenCalledWith(configPath);

    expect(JobOrchestrator).toHaveBeenCalledWith(dummyConfig);
    expect(executeMock).toHaveBeenCalledWith(repoInput);

    expect(ReportGenerator).toHaveBeenCalledTimes(1);
    const expectedOutputDir = `${dummyConfig.output.artifacts_dir}/${dummyResult.jobId}`;
    expect(generateReportsMock).toHaveBeenCalledWith(dummyResult, expectedOutputDir, dummyConfig.output.format);

    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');

    expect(result).toEqual({
      result: dummyResult,
      reports: dummyReports,
    });
  });

  it('should handle error thrown during config loading and rethrow', async () => {
    const error = new Error('Load failed');
    loadMock.mockRejectedValueOnce(error);

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow(error);
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should handle error thrown during orchestrator execution and rethrow', async () => {
    const error = new Error('Execute failed');
    executeMock.mockRejectedValueOnce(error);

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow(error);
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should handle error thrown during report generation and rethrow', async () => {
    const error = new Error('Report generation failed');
    generateReportsMock.mockRejectedValueOnce(error);

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow(error);
    expect(logger.error).toHaveBeenCalledWith(`Test bot failed: ${error}`);
  });

  it('should use default config path if none provided', async () => {
    await runTestBot(repoInput);

    expect(loadMock).toHaveBeenCalledWith(undefined);
  });
});
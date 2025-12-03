// @ts-nocheck
import { runTestBot } from './index.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { JobOrchestrator } from './orchestrator/JobOrchestrator.js';
import { ReportGenerator } from './reporter/ReportGenerator.js';
import logger from './utils/logger.js';

jest.mock('./config/ConfigLoader.js');
jest.mock('./orchestrator/JobOrchestrator.js');
jest.mock('./reporter/ReportGenerator.js');
jest.mock('./utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('runTestBot', () => {
  const repoInput = 'test-repo';
  const configPath = '/some/path/config.json';

  let mockConfigLoaderInstance: jest.Mocked<ConfigLoader>;
  let mockJobOrchestratorInstance: jest.Mocked<JobOrchestrator>;
  let mockReportGeneratorInstance: jest.Mocked<ReportGenerator>;

  const fakeConfig = {
    output: {
      artifacts_dir: 'artifacts',
      format: ['json', 'html'],
    },
  };

  const fakeResult = {
    jobId: 'job123',
    someOtherData: 'value',
  };

  const fakeReports = ['report1', 'report2'];

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigLoaderInstance = {
      load: jest.fn().mockResolvedValue(fakeConfig),
    } as unknown as jest.Mocked<ConfigLoader>;

    (ConfigLoader as jest.Mock).mockImplementation(() => mockConfigLoaderInstance);

    mockJobOrchestratorInstance = {
      execute: jest.fn().mockResolvedValue(fakeResult),
    } as unknown as jest.Mocked<JobOrchestrator>;

    (JobOrchestrator as jest.Mock).mockImplementation(() => mockJobOrchestratorInstance);

    mockReportGeneratorInstance = {
      generateReports: jest.fn().mockResolvedValue(fakeReports),
    } as unknown as jest.Mocked<ReportGenerator>;

    (ReportGenerator as jest.Mock).mockImplementation(() => mockReportGeneratorInstance);
  });

  it('should run the test bot successfully and return result and reports', async () => {
    const ret = await runTestBot(repoInput, configPath);

    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(mockConfigLoaderInstance.load).toHaveBeenCalledWith(configPath);
    expect(mockJobOrchestratorInstance.execute).toHaveBeenCalledWith(repoInput);
    expect(mockReportGeneratorInstance.generateReports).toHaveBeenCalledWith(
      fakeResult,
      `${fakeConfig.output.artifacts_dir}/${fakeResult.jobId}`,
      fakeConfig.output.format
    );
    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');

    expect(ret).toEqual({
      result: fakeResult,
      reports: fakeReports,
    });
  });

  it('should run without configPath', async () => {
    await runTestBot(repoInput);
    expect(mockConfigLoaderInstance.load).toHaveBeenCalledWith(undefined);
  });

  it('should log and throw error if any step fails', async () => {
    const error = new Error('fail load');
    mockConfigLoaderInstance.load.mockRejectedValueOnce(error);

    await expect(runTestBot(repoInput, configPath)).rejects.toThrow('fail load');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Test bot failed:'));
  });
});
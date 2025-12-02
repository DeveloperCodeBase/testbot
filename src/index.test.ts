import { runTestBot, ConfigLoader, JobOrchestrator, ReportGenerator } from './index.js';
import logger from './utils/logger.js';

jest.mock('./config/ConfigLoader.js');
jest.mock('./orchestrator/JobOrchestrator.js');
jest.mock('./reporter/ReportGenerator.js');
jest.mock('./utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('runTestBot', () => {
  const mockConfig = {
    output: {
      artifacts_dir: '/tmp/artifacts',
      format: ['json', 'html'],
    },
  };

  let configLoaderMock: jest.Mocked<ConfigLoader>;
  let orchestratorMock: jest.Mocked<JobOrchestrator>;
  let reportGeneratorMock: jest.Mocked<ReportGenerator>;

  beforeEach(() => {
    jest.clearAllMocks();

    configLoaderMock = new ConfigLoader() as jest.Mocked<ConfigLoader>;
    (ConfigLoader as jest.Mock).mockImplementation(() => configLoaderMock);
    configLoaderMock.load = jest.fn().mockResolvedValue(mockConfig);

    orchestratorMock = new JobOrchestrator(mockConfig) as jest.Mocked<JobOrchestrator>;
    (JobOrchestrator as jest.Mock).mockImplementation(() => orchestratorMock);

    orchestratorMock.execute = jest.fn().mockResolvedValue({
      jobId: 'job123',
      some: 'result',
    });

    reportGeneratorMock = new ReportGenerator() as jest.Mocked<ReportGenerator>;
    (ReportGenerator as jest.Mock).mockImplementation(() => reportGeneratorMock);

    reportGeneratorMock.generateReports = jest.fn().mockResolvedValue([
      '/tmp/artifacts/job123/report1.json',
      '/tmp/artifacts/job123/report2.html',
    ]);
  });

  it('should run the test bot successfully and return results and reports', async () => {
    const repoInput = 'https://github.com/user/repo.git';
    const configPath = './config.yaml';

    const result = await runTestBot(repoInput, configPath);

    // Verify logger called
    expect(logger.info).toHaveBeenCalledWith('Starting test bot...');
    expect(logger.info).toHaveBeenCalledWith('Test bot completed successfully');
    expect(logger.error).not.toHaveBeenCalled();

    // Verify ConfigLoader.load called with configPath
    expect(configLoaderMock.load).toHaveBeenCalledWith(configPath);

    // Verify JobOrchestrator.execute called with repoInput
    expect(orchestratorMock.execute).toHaveBeenCalledWith(repoInput);

    // Verify ReportGenerator.generateReports called with correct params
    expect(reportGeneratorMock.generateReports).toHaveBeenCalledWith(
      { jobId: 'job123', some: 'result' },
      '/tmp/artifacts/job123',
      ['json', 'html']
    );

    // Returned result contains result and reports
    expect(result).toEqual({
      result: { jobId: 'job123', some: 'result' },
      reports: ['/tmp/artifacts/job123/report1.json', '/tmp/artifacts/job123/report2.html'],
    });
  });

  it('should throw error and log error message if any step fails', async () => {
    const errorMessage = 'Failed to load config';
    configLoaderMock.load.mockRejectedValueOnce(new Error(errorMessage));

    await expect(runTestBot('repo', undefined)).rejects.toThrow(errorMessage);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Test bot failed:`));
  });

  it('should handle missing configPath (undefined) gracefully', async () => {
    await expect(runTestBot('my-repo')).resolves.toBeDefined();

    expect(configLoaderMock.load).toHaveBeenCalledWith(undefined);
  });

  it('should pass correct outputDir derived from config and jobId', async () => {
    const resultId = 'job999';
    orchestratorMock.execute.mockResolvedValue({ jobId: resultId });

    await runTestBot('repo');

    expect(reportGeneratorMock.generateReports).toHaveBeenCalledWith(
      expect.any(Object),
      `/tmp/artifacts/${resultId}`,
      expect.any(Array)
    );
  });
});
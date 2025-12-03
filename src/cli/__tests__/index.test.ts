// @ts-nocheck
import { Command } from 'commander';
import { ConfigLoader } from '../../config/ConfigLoader';
import { JobOrchestrator } from '../../orchestrator/JobOrchestrator.js';
import { ReportGenerator } from '../../reporter/ReportGenerator.js';
import logger from '../../utils/logger.js';
import path from 'path';

// Mock all dependencies that the CLI uses
jest.mock('../../config/ConfigLoader.js');
jest.mock('../../orchestrator/JobOrchestrator.js');
jest.mock('../../reporter/ReportGenerator.js');
jest.mock('../../utils/logger.js');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
}));

describe('CLI index.ts', () => {
  // We will require the file dynamically inside tests to test side-effects related to commander
  let processExitSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let mockExitCalls: number[];

  beforeEach(() => {
    jest.resetModules();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      mockExitCalls.push(code || 0);
      throw new Error(`process.exit: ${code}`);
    }) as any);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    mockExitCalls = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper to setup mocks for orchestrator and config loader etc.
  function setupMocks(result: any = {}, reports: any = {}) {
    (ConfigLoader as jest.Mock).mockImplementation(() => ({
      load: jest.fn().mockResolvedValue({ // partial config
        enabled_tests: { unit: true, integration: true, e2e: true },
        coverage: { threshold: 80 },
        git: { enabled: false, auto_push: false },
        output: { artifacts_dir: './artifacts', verbose: false, format: ['json', 'html'] },
        auto_fix: { enabled: false, install_dependencies: false, update_test_config: false, create_virtualenv: false },
      }),
    }));

    (JobOrchestrator as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockResolvedValue(result),
    }));

    (ReportGenerator as jest.Mock).mockImplementation(() => ({
      generateReports: jest.fn().mockResolvedValue(reports),
    }));
  }

  describe('applyCliOptions', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyCliOptions } = require('../index.js');

    it('should update config based on CLI options', () => {
      const baseConfig = {
        enabled_tests: { unit: true, integration: true, e2e: true },
        coverage: { threshold: 80 },
        git: { enabled: false, auto_push: false },
        output: { artifacts_dir: './artifacts', verbose: false },
        auto_fix: {
          enabled: false,
          install_dependencies: false,
          update_test_config: false,
          create_virtualenv: false,
        },
      };

      let updated = applyCliOptions(JSON.parse(JSON.stringify(baseConfig)), {
        unit: false,
        integration: false,
        e2e: false,
        coverageThreshold: '90',
        gitPush: true,
        verbose: true,
        output: 'custom_out',
        autoFix: true,
        autoFixDepsOnly: true,
        autoFixConfigOnly: true,
      });

      expect(updated.enabled_tests).toEqual({ unit: false, integration: false, e2e: false });
      expect(updated.coverage.threshold).toBe(90);
      expect(updated.git.enabled).toBe(true);
      expect(updated.git.auto_push).toBe(true);
      expect(updated.output.verbose).toBe(true);
      expect(updated.output.artifacts_dir).toBe('custom_out');

      // autoFix true sets all enabled first
      expect(updated.auto_fix.enabled).toBe(true);
      expect(updated.auto_fix.install_dependencies).toBe(false);
      expect(updated.auto_fix.update_test_config).toBe(true);
      expect(updated.auto_fix.create_virtualenv).toBe(false);

      // autoFixDepsOnly overrides to only install_dependencies
      // but autoFixConfigOnly overrides again? Because both true, last wins
      // The implementation applies autoFixConfigOnly last, so expected state:
      expect(updated.auto_fix.enabled).toBe(true);
      expect(updated.auto_fix.install_dependencies).toBe(false);
      expect(updated.auto_fix.update_test_config).toBe(true);
      expect(updated.auto_fix.create_virtualenv).toBe(false);
    });
  });

  describe('CLI command analyze', () => {
    it('runs successfully with default options and logs output', async () => {
      const result = {
        jobId: 'job123',
        status: 'success',
        summary: {
          totalProjects: 2,
          totalTests: 10,
          passedTests: 8,
          failedTests: 2,
        },
        generatedTestFiles: ['file1', 'file2'],
        duration: 12345,
        errors: [],
      };

      const reports = {
        jsonPath: '/path/to/report.json',
        htmlPath: '/path/to/report.html',
      };

      setupMocks(result, reports);

      // Need to reset modules to load CLI with fresh mocks
      jest.resetModules();
      const cli = await import('../index.js');

      // Because program.parse() calls async action and process.exit, we catch error triggered by process.exit mock
      await expect(cli).resolves.toBeDefined();

      // Instead simulate calling command action directly:
      const { program } = cli;
      const analyzeCommand = program.commands.find(cmd => cmd._name === 'analyze');

      const fakeOptions = {
        config: undefined,
        output: './artifacts',
        unit: true,
        integration: true,
        e2e: true,
        coverageThreshold: '80',
        gitPush: false,
        autoFix: undefined,
        autoFixDepsOnly: false,
        autoFixConfigOnly: false,
        verbose: false,
      };

      // Execute with a repo argument and options, catch exit
      await expect(analyzeCommand._actionHandler('repo-url', fakeOptions)).resolves.toBeUndefined();

      // Check console logs called accordingly
      expect(consoleLogSpy).toHaveBeenCalledWith('\n=== Test Bot Results ===');
      expect(consoleLogSpy).toHaveBeenCalledWith('Status: success');
      expect(consoleLogSpy).toHaveBeenCalledWith('Projects: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('Total Tests: 10');
      expect(consoleLogSpy).toHaveBeenCalledWith('Passed: 8');
      expect(consoleLogSpy).toHaveBeenCalledWith('Failed: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('Generated Files: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Duration: \d+\.\d+s/));
      expect(consoleLogSpy).toHaveBeenCalledWith('\nJSON Report: /path/to/report.json');
      expect(consoleLogSpy).toHaveBeenCalledWith('HTML Report: /path/to/report.html');

      const { default: loggerMock } = await import('../../utils/logger.js');
      expect(loggerMock.info).toHaveBeenCalledWith('Starting test bot...');
      expect(loggerMock.info).toHaveBeenCalledWith('Test bot completed successfully');
    });

    it('logs errors and exits with failure on failed status', async () => {
      const result = {
        jobId: 'job123',
        status: 'failed',
        summary: {
          totalProjects: 0,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
        },
        generatedTestFiles: [],
        duration: 0,
        errors: ['error1', 'error2'],
      };

      setupMocks(result, {});

      jest.resetModules();
      const cli = await import('../index.js');
      const { program } = cli;
      const analyzeCommand = program.commands.find(cmd => cmd._name === 'analyze');

      const fakeOptions = {
        config: undefined,
        output: './artifacts',
        unit: true,
        integration: true,
        e2e: true,
        coverageThreshold: '80',
        gitPush: false,
        autoFix: undefined,
        autoFixDepsOnly: false,
        autoFixConfigOnly: false,
        verbose: false,
      };

      await expect(analyzeCommand._actionHandler('repo-url', fakeOptions)).rejects.toThrow(/process.exit/);

      expect(consoleErrorSpy).toHaveBeenCalledWith('\nErrors:');
      expect(consoleErrorSpy).toHaveBeenCalledWith('- error1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('- error2');
      expect(processExitSpy).toHaveBeenCalledWith(1);

      const { default: loggerMock } = await import('../../utils/logger.js');
      expect(loggerMock.info).toHaveBeenCalledWith('Starting test bot...');
    });

    it('catches errors thrown in action handler and logs them', async () => {
      // Mock ConfigLoader to throw
      (ConfigLoader as jest.Mock).mockImplementation(() => ({
        load: jest.fn().mockRejectedValue(new Error('config error')),
      }));

      jest.resetModules();
      const cli = await import('../index.js');
      const { program } = cli;
      const analyzeCommand = program.commands.find(cmd => cmd._name === 'analyze');

      const fakeOptions = {
        config: undefined,
        output: './artifacts',
        unit: true,
        integration: true,
        e2e: true,
        coverageThreshold: '80',
        gitPush: false,
        autoFix: undefined,
        autoFixDepsOnly: false,
        autoFixConfigOnly: false,
        verbose: false,
      };

      await expect(analyzeCommand._actionHandler('repo-url', fakeOptions)).rejects.toThrow(/process.exit/);

      expect(consoleErrorSpy).toHaveBeenCalledWith('\nError: config error');
      expect(processExitSpy).toHaveBeenCalledWith(1);

      const { default: loggerMock } = await import('../../utils/logger.js');
      expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Test bot failed'));
    });
  });
});
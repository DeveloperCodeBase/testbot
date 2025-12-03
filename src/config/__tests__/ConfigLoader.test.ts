// @ts-nocheck
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { ConfigLoader } from '../ConfigLoader';
import * as fileUtils from '../../utils/fileUtils';
import logger from '../../utils/logger';

jest.mock('fs/promises');
jest.mock('js-yaml');
jest.mock('../../utils/fileUtils');
jest.mock('../../utils/logger');

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;

  const DEFAULT_CONFIG = require('../schema.js').DEFAULT_CONFIG;

  beforeEach(() => {
    jest.resetAllMocks();
    configLoader = new ConfigLoader();
    // Clear env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.LOG_LEVEL;
    delete process.env.VERBOSE;
  });

  describe('load', () => {
    it('should load config from provided path and merge with defaults, apply env overrides', async () => {
      const fakeConfig = {
        enabled_tests: { testA: true },
        llm: { provider: 'claude' },
        output: { verbose: false },
      };
      // Mock loadFromFile
      jest.spyOn(configLoader as any, 'loadFromFile').mockResolvedValue(fakeConfig);
      jest.spyOn(configLoader as any, 'mergeWithDefaults').mockImplementation((cfg) => {
        return { ...DEFAULT_CONFIG, ...cfg };
      });
      jest.spyOn(configLoader as any, 'applyEnvironmentOverrides').mockImplementation((cfg) => {
        cfg.llm.api_key = 'env-api-key';
      });

      const result = await configLoader.load('some/path.yml');
      expect((configLoader as any).loadFromFile).toHaveBeenCalledWith('some/path.yml');
      expect((configLoader as any).mergeWithDefaults).toHaveBeenCalledWith(fakeConfig);
      expect((configLoader as any).applyEnvironmentOverrides).toHaveBeenCalled();

      expect(result.llm.api_key).toBe('env-api-key');
      expect(logger.info).toHaveBeenCalledWith('Configuration loaded successfully');
    });

    it('should load config from default file if configPath is not provided and file exists', async () => {
      const defaultPath = path.join(process.cwd(), '.ai-test-bot.yml');
      (fileUtils.fileExists as jest.Mock).mockResolvedValue(true);
      const fakeConfig = { enabled_tests: { testB: true } };
      jest.spyOn(configLoader as any, 'loadFromFile').mockResolvedValue(fakeConfig);
      jest.spyOn(configLoader as any, 'mergeWithDefaults').mockReturnValue({ ...DEFAULT_CONFIG, ...fakeConfig });
      jest.spyOn(configLoader as any, 'applyEnvironmentOverrides').mockImplementation(() => {});

      const result = await configLoader.load();

      expect(fileUtils.fileExists).toHaveBeenCalledWith(defaultPath);
      expect((configLoader as any).loadFromFile).toHaveBeenCalledWith(defaultPath);
      expect(result.enabled_tests.testB).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Configuration loaded successfully');
    });

    it('should use defaults if no configPath and default file does not exist', async () => {
      (fileUtils.fileExists as jest.Mock).mockResolvedValue(false);
      const mergeSpy = jest.spyOn(configLoader as any, 'mergeWithDefaults');
      const envSpy = jest.spyOn(configLoader as any, 'applyEnvironmentOverrides');

      const result = await configLoader.load();

      expect(fileUtils.fileExists).toHaveBeenCalled();
      expect(mergeSpy).toHaveBeenCalledWith({});
      expect(envSpy).toHaveBeenCalledWith(expect.any(Object));
      expect(result).toEqual(expect.objectContaining(DEFAULT_CONFIG));
      expect(logger.info).toHaveBeenCalledWith('Configuration loaded successfully');
    });
  });

  describe('loadFromFile', () => {
    it('should read file and parse yaml, returning config object', async () => {
      const filePath = 'config.yml';
      const fileContent = 'enabled_tests:\n  test1: true\n';
      const parsedYaml = { enabled_tests: { test1: true } };

      (fs.readFile as jest.Mock).mockResolvedValue(fileContent);
      (yaml.load as jest.Mock).mockReturnValue(parsedYaml);

      const result = await (configLoader as any).loadFromFile(filePath);

      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(yaml.load).toHaveBeenCalledWith(fileContent);
      expect(logger.info).toHaveBeenCalledWith(`Loaded config from: ${filePath}`);
      expect(result).toEqual(parsedYaml);
    });

    it('should return empty object and log warning if file read fails', async () => {
      const filePath = 'badpath.yml';
      const error = new Error('File not found');
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      const result = await (configLoader as any).loadFromFile(filePath);

      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(result).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Failed to load config from ${filePath}`));
    });
  });

  describe('mergeWithDefaults', () => {
    it('should merge partial config with defaults correctly', () => {
      const partialConfig = {
        enabled_tests: { test1: true },
        auto_fix: { fixLint: false },
        exclude_patterns: ['node_modules'],
        llm: { provider: 'custom' },
      };

      const merged = (configLoader as any).mergeWithDefaults(partialConfig);

      expect(merged.enabled_tests).toEqual({ ...DEFAULT_CONFIG.enabled_tests, test1: true });
      expect(merged.auto_fix).toEqual({ ...DEFAULT_CONFIG.auto_fix, fixLint: false });
      expect(merged.exclude_patterns).toEqual(['node_modules']);
      expect(merged.llm).toEqual({ ...DEFAULT_CONFIG.llm, provider: 'custom' });
      // Other props fall back to defaults
      expect(merged.git).toEqual(DEFAULT_CONFIG.git);
    });

    it('should use default exclude_patterns if none provided', () => {
      const partialConfig = {};
      const merged = (configLoader as any).mergeWithDefaults(partialConfig);
      expect(merged.exclude_patterns).toBe(DEFAULT_CONFIG.exclude_patterns);
    });
  });

  describe('applyEnvironmentOverrides', () => {
    let config: any;

    beforeEach(() => {
      config = {
        llm: { provider: 'openai', api_key: undefined },
        output: { verbose: false },
      };
    });

    it('should override OPENAI_API_KEY if set', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.llm.api_key).toBe('openai-key');
    });

    it('should override ANTHROPIC_API_KEY if provider is claude', () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      config.llm.provider = 'claude';
      config.llm.api_key = 'original';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.llm.api_key).toBe('anthropic-key');
    });

    it('should not override ANTHROPIC_API_KEY if provider is not claude', () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      config.llm.provider = 'openai';
      config.llm.api_key = 'original';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.llm.api_key).toBe('original');
    });

    it('should override GOOGLE_API_KEY if provider is gemini', () => {
      process.env.GOOGLE_API_KEY = 'google-key';
      config.llm.provider = 'gemini';
      config.llm.api_key = 'original';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.llm.api_key).toBe('google-key');
    });

    it('should set output.verbose true if VERBOSE env var is "true"', () => {
      process.env.VERBOSE = 'true';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.output.verbose).toBe(true);
    });

    it('should not set output.verbose if VERBOSE env var is not "true"', () => {
      process.env.VERBOSE = 'false';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(config.output.verbose).toBe(false);
    });

    it('should set process.env.LOG_LEVEL if LOG_LEVEL env var is set', () => {
      process.env.LOG_LEVEL = 'debug';
      (configLoader as any).applyEnvironmentOverrides(config);
      expect(process.env.LOG_LEVEL).toBe('debug');
    });
  });
});
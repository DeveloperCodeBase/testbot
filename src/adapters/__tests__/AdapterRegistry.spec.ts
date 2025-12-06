// @ts-nocheck
import { AdapterRegistry } from '../AdapterRegistry';
import { LanguageAdapter } from '../LanguageAdapter';
import { ProjectDescriptor } from '../../models/ProjectDescriptor';

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  // Create dummy language adapter
  class DummyAdapter implements LanguageAdapter {
    language = 'dummy';
    canHandle = jest.fn((project: ProjectDescriptor) => true);
  }

  beforeEach(() => {
    registry = new AdapterRegistry();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should register all known adapters', () => {
      const adapters = registry.getAllAdapters();
      // The registry should contain at least Node, Python, Java, CSharp, Go adapters
      expect(adapters.length).toBeGreaterThanOrEqual(5);

      // All adapters should have language property defined and be unique
      const langs = adapters.map((a) => a.language);
      const uniqueLangs = new Set(langs);
      expect(uniqueLangs.size).toBe(langs.length);

      // Logger.info should be called (don't check exact count as it may vary)
      const mockLogger = jest.mocked(require('../../utils/logger'));
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('registerAdapter', () => {
    it('should add new adapter and overwrite if language exists', () => {
      const dummyAdapter = new DummyAdapter();

      // Register dummy adapter
      registry.registerAdapter(dummyAdapter);
      const mockLogger = jest.mocked(require('../../utils/logger'));
      expect(mockLogger.info).toHaveBeenCalledWith(`Registered adapter for: ${dummyAdapter.language}`);

      const found = registry.getAllAdapters().find((a) => a.language === 'dummy');
      expect(found).toBe(dummyAdapter);

      // Register another adapter with same language to overwrite
      const dummyAdapter2 = new DummyAdapter();
      dummyAdapter2.canHandle = jest.fn(() => false);
      registry.registerAdapter(dummyAdapter2);

      const found2 = registry.getAllAdapters().filter((a) => a.language === 'dummy');
      expect(found2).toHaveLength(1);
      expect(found2[0]).toBe(dummyAdapter2);
    });
  });

  describe('getAdapter', () => {
    it('should return adapter that can handle the project', () => {
      const dummyAdapter = new DummyAdapter();
      dummyAdapter.canHandle.mockReturnValueOnce(false).mockReturnValueOnce(true);

      // Register dummy adapter manually to test ordering
      registry.registerAdapter(dummyAdapter);

      const project: ProjectDescriptor = {
        name: 'test-project',
        language: 'dummy',
        sourceRoot: '',
        config: {},
      };

      // Spy on existing adapters' canHandle to return false
      const adapters = registry.getAllAdapters();
      adapters.forEach((adapter) => {
        jest.spyOn(adapter, 'canHandle').mockReturnValue(false);
      });
      // Mock dummyAdapter.canHandle to true after first false
      dummyAdapter.canHandle.mockReturnValueOnce(true);

      const result = registry.getAdapter(project);
      expect(result).toBe(dummyAdapter);
    });

    it('should return null and log warning if no adapter found', () => {
      // Spy on adapters to return false always
      registry.getAllAdapters().forEach((adapter) => {
        jest.spyOn(adapter, 'canHandle').mockReturnValue(false);
      });

      const project: ProjectDescriptor = {
        name: 'no-adapter-proj',
        language: 'unknownLang',
        sourceRoot: '',
        config: {},
      };

      const logSpy = jest.spyOn(require('../../utils/logger'), 'warn');

      const result = registry.getAdapter(project);
      expect(result).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        `No adapter found for project: ${project.name} (language: ${project.language})`
      );
    });
  });

  describe('getAllAdapters', () => {
    it('should return all registered adapters', () => {
      const adapters = registry.getAllAdapters();
      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
      adapters.forEach((adapter) => {
        expect(typeof adapter.language).toBe('string');
        expect(typeof adapter.canHandle).toBe('function');
      });
    });
  });
});
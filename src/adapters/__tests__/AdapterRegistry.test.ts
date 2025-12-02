import { AdapterRegistry } from '../AdapterRegistry.js';
import { LanguageAdapter } from '../LanguageAdapter.js';
import { ProjectDescriptor } from '../../models/ProjectDescriptor.js';
import logger from '../../utils/logger.js';

jest.mock('../../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

class DummyAdapter implements LanguageAdapter {
  language = 'dummy';
  canHandle = jest.fn();
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('registers NodeAdapter, PythonAdapter, and JavaAdapter by default', () => {
      const adapters = registry.getAllAdapters();
      const languages = adapters.map(a => a.language);
      expect(languages).toEqual(expect.arrayContaining(['node', 'python', 'java']));
      expect(logger.info).toHaveBeenCalledTimes(3);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Registered adapter for'));
    });
  });

  describe('registerAdapter', () => {
    it('adds new adapter to the registry and logs info', () => {
      const dummyAdapter = new DummyAdapter();
      registry.registerAdapter(dummyAdapter);

      expect(registry.getAllAdapters()).toContain(dummyAdapter);
      expect(logger.info).toHaveBeenCalledWith(`Registered adapter for: ${dummyAdapter.language}`);
    });

    it('overwrites existing adapter with same language', () => {
      const dummyAdapter1 = new DummyAdapter();
      const dummyAdapter2 = new DummyAdapter();
      registry.registerAdapter(dummyAdapter1);
      dummyAdapter2.language = dummyAdapter1.language;
      registry.registerAdapter(dummyAdapter2);
      // getAllAdapters should include dummyAdapter2 and not dummyAdapter1
      const adapters = registry.getAllAdapters().filter(a => a.language === dummyAdapter1.language);
      expect(adapters).toContain(dummyAdapter2);
      expect(adapters).not.toContain(dummyAdapter1);
    });
  });

  describe('getAdapter', () => {
    it('returns adapter that can handle the project', () => {
      const dummyAdapter = new DummyAdapter();
      dummyAdapter.canHandle.mockReturnValue(true);
      registry.registerAdapter(dummyAdapter);

      const project: ProjectDescriptor = {
        name: 'testProject',
        language: 'dummy',
      };

      const result = registry.getAdapter(project);
      expect(dummyAdapter.canHandle).toHaveBeenCalledWith(project);
      expect(result).toBe(dummyAdapter);
    });

    it('returns first adapter that can handle the project if multiple', () => {
      const dummyAdapter1 = new DummyAdapter();
      dummyAdapter1.canHandle.mockReturnValue(false);

      const dummyAdapter2 = new DummyAdapter();
      dummyAdapter2.language = 'dummy2';
      dummyAdapter2.canHandle.mockReturnValue(true);

      registry.registerAdapter(dummyAdapter1);
      registry.registerAdapter(dummyAdapter2);

      const project: ProjectDescriptor = {
        name: 'p',
        language: 'dummy2',
      };

      const result = registry.getAdapter(project);
      expect(result).toBe(dummyAdapter2);
    });

    it('returns null and logs warning if no adapter can handle the project', () => {
      const dummyAdapter = new DummyAdapter();
      dummyAdapter.canHandle.mockReturnValue(false);
      registry.registerAdapter(dummyAdapter);

      const project: ProjectDescriptor = {
        name: 'unknown',
        language: 'unknownLang',
      };

      const result = registry.getAdapter(project);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        `No adapter found for project: ${project.name} (language: ${project.language})`
      );
    });

    it('returns null and logs warning if registry is empty', () => {
      // create empty registry by clearing adapters after constructor
      // Note: private adapters cannot be reassigned here, so create new class instance with empty constructor for test
      class EmptyRegistry extends AdapterRegistry {
        constructor() {
          super();
          (this as any).adapters.clear();
        }
      }
      const emptyRegistry = new EmptyRegistry();

      const project: ProjectDescriptor = {
        name: 'proj',
        language: 'node',
      };
      const result = emptyRegistry.getAdapter(project);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        `No adapter found for project: ${project.name} (language: ${project.language})`
      );
    });
  });

  describe('getAllAdapters', () => {
    it('returns all registered adapters as array', () => {
      const dummyAdapter = new DummyAdapter();
      registry.registerAdapter(dummyAdapter);

      const adapters = registry.getAllAdapters();
      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters).toEqual(expect.arrayContaining(adapters));
      expect(adapters).toContain(dummyAdapter);
    });

    it('returns empty array if no adapters registered', () => {
      class EmptyRegistry extends AdapterRegistry {
        constructor() {
          super();
          (this as any).adapters.clear();
        }
      }
      const emptyRegistry = new EmptyRegistry();
      expect(emptyRegistry.getAllAdapters()).toEqual([]);
    });
  });
});
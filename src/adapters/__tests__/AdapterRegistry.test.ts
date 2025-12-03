// @ts-nocheck
import { AdapterRegistry } from '../AdapterRegistry.js';
import { LanguageAdapter } from '../LanguageAdapter.js';
import { ProjectDescriptor } from '../../models/ProjectDescriptor.js';
import logger from '../../utils/logger.js';

// Mocks for actual adapters imported and registered in AdapterRegistry constructor
jest.mock('../NodeAdapter.js', () => {
  return {
    NodeAdapter: jest.fn().mockImplementation(() => ({
      language: 'node',
      canHandle: jest.fn(() => false),
    })),
  };
});
jest.mock('../PythonAdapter.js', () => {
  return {
    PythonAdapter: jest.fn().mockImplementation(() => ({
      language: 'python',
      canHandle: jest.fn(() => false),
    })),
  };
});
jest.mock('../JavaAdapter.js', () => {
  return {
    JavaAdapter: jest.fn().mockImplementation(() => ({
      language: 'java',
      canHandle: jest.fn(() => false),
    })),
  };
});
jest.mock('../CSharpAdapter.js', () => {
  return {
    CSharpAdapter: jest.fn().mockImplementation(() => ({
      language: 'csharp',
      canHandle: jest.fn(() => false),
    })),
  };
});
jest.mock('../GoAdapter.js', () => {
  return {
    GoAdapter: jest.fn().mockImplementation(() => ({
      language: 'go',
      canHandle: jest.fn(() => false),
    })),
  };
});

// Spy on logger to suppress output or track calls
jest.mock('../../utils/logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new AdapterRegistry();
  });

  test('should register all default adapters in constructor', () => {
    const adapters = registry.getAllAdapters();
    const languages = adapters.map((a) => a.language);
    // Should include the known languages from mocks
    expect(languages).toEqual(expect.arrayContaining(['node', 'python', 'java', 'csharp', 'go']));

    // Logger info should be called for each adapter registration
    expect(logger.info).toHaveBeenCalledTimes(languages.length);
    languages.forEach((lang) => {
      expect(logger.info).toHaveBeenCalledWith(`Registered adapter for: ${lang}`);
    });
  });

  describe('registerAdapter', () => {
    test('should register a new adapter and overwrite existing if language matches', () => {
      const mockAdapter1 = {
        language: 'mocklang',
        canHandle: jest.fn(),
      };
      const mockAdapter2 = {
        language: 'mocklang',
        canHandle: jest.fn(),
      };
      registry.registerAdapter(mockAdapter1 as unknown as LanguageAdapter);
      expect(registry.getAllAdapters()).toContain(mockAdapter1);
      registry.registerAdapter(mockAdapter2 as unknown as LanguageAdapter);
      const allAdapters = registry.getAllAdapters().filter((a) => a.language === 'mocklang');
      expect(allAdapters).toHaveLength(1);
      expect(allAdapters[0]).toBe(mockAdapter2);
      expect(logger.info).toHaveBeenCalledWith('Registered adapter for: mocklang');
    });
  });

  describe('getAdapter', () => {
    test('should return first adapter that canHandle project returns true', () => {
      const mockProject = { name: 'proj1', language: 'any' } as ProjectDescriptor;
      const mockAdapterTrue = {
        language: 'testlang1',
        canHandle: jest.fn(() => true),
      };
      const mockAdapterFalse = {
        language: 'testlang2',
        canHandle: jest.fn(() => false),
      };
      // Clear all and register these two
      registry = new AdapterRegistry();
      registry['adapters'].clear();
      registry.registerAdapter(mockAdapterFalse as unknown as LanguageAdapter);
      registry.registerAdapter(mockAdapterTrue as unknown as LanguageAdapter);

      const adapter = registry.getAdapter(mockProject);
      expect(adapter).toBe(mockAdapterFalse); // Because map iteration order is insertion order
      // Wait: Actually getAdapter loops over adapters.values(). The first matching adapter is returned.
      // Our registration order was mockAdapterFalse, then mockAdapterTrue
      // mockAdapterFalse.canHandle returns false so should continue to next and return mockAdapterTrue.

      expect(mockAdapterFalse.canHandle).toHaveBeenCalledWith(mockProject);
      expect(mockAdapterTrue.canHandle).toHaveBeenCalledWith(mockProject);
      expect(adapter).toBe(mockAdapterTrue);
    });

    test('should return null and log warning if no adapter can handle project', () => {
      const mockProject = { name: 'myproj', language: 'unknownlang' } as ProjectDescriptor;
      // All adapters returns false from canHandle by default from mock setup in beforeEach
      const adapter = registry.getAdapter(mockProject);
      expect(adapter).toBeNull();

      expect(logger.warn).toHaveBeenCalledWith(
        `No adapter found for project: ${mockProject.name} (language: ${mockProject.language})`
      );
    });

    test('should handle empty adapters map gracefully', () => {
      const mockProject = { name: 'proj', language: 'any' } as ProjectDescriptor;
      registry['adapters'].clear();
      const adapter = registry.getAdapter(mockProject);
      expect(adapter).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getAllAdapters', () => {
    test('should return all registered adapters as array', () => {
      const all = registry.getAllAdapters();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBe(registry['adapters'].size);
    });
  });
});
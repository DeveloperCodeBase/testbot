import { LanguageAdapter } from './LanguageAdapter.js';
import { NodeAdapter } from './NodeAdapter.js';
import { PythonAdapter } from './PythonAdapter.js';
import { JavaAdapter } from './JavaAdapter.js';
import { CSharpAdapter } from './CSharpAdapter.js';
import { GoAdapter } from './GoAdapter.js';
import { ProjectDescriptor } from '../models/ProjectDescriptor.js';
import logger from '../utils/logger.js';

/**
 * Registry for all language adapters
 */
export class AdapterRegistry {
    private adapters: Map<string, LanguageAdapter> = new Map();

    constructor() {
        // Register all adapters
        this.registerAdapter(new NodeAdapter());
        this.registerAdapter(new PythonAdapter());
        this.registerAdapter(new JavaAdapter());
        this.registerAdapter(new CSharpAdapter());
        this.registerAdapter(new GoAdapter());
    }

    /**
     * Register a language adapter
     */
    registerAdapter(adapter: LanguageAdapter): void {
        this.adapters.set(adapter.language, adapter);
        logger.info(`Registered adapter for: ${adapter.language}`);
    }

    /**
     * Get adapter for a project
     */
    getAdapter(project: ProjectDescriptor): LanguageAdapter | null {
        for (const adapter of this.adapters.values()) {
            if (adapter.canHandle(project)) {
                return adapter;
            }
        }

        logger.warn(`No adapter found for project: ${project.name} (language: ${project.language})`);
        return null;
    }

    /**
     * Get all registered adapters
     */
    getAllAdapters(): LanguageAdapter[] {
        return Array.from(this.adapters.values());
    }
}

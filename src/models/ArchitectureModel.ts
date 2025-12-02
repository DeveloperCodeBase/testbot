/**
 * Represents a component in the architecture
 */
export interface Component {
    name: string;
    type: 'controller' | 'service' | 'repository' | 'model' | 'view' | 'utility' | 'other';
    path: string;
    dependencies: string[];
    criticality: 'high' | 'medium' | 'low';
}

/**
 * Represents an API endpoint
 */
export interface ApiEndpoint {
    method: string;
    path: string;
    handler: string;
    filePath: string;
    lineNumber?: number;
}

/**
 * Represents a user flow or journey
 */
export interface UserFlow {
    name: string;
    description: string;
    steps: string[];
    endpoints: string[];
    criticality: 'high' | 'medium' | 'low';
}

/**
 * Architecture model of the codebase
 */
export interface ArchitectureModel {
    components: Component[];
    apiEndpoints: ApiEndpoint[];
    userFlows: UserFlow[];
    componentGraph: Record<string, string[]>; // component -> dependencies
    criticalDomains: string[]; // e.g., ['auth', 'payment', 'order']
}

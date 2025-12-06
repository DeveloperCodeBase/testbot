module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.spec.ts',
        '**/?(*.)(spec|test).ts'
    ],
    // Exclude demo-benchmarks and generated test fixtures
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/demo-benchmarks/',
        '/__tests__/fixtures/',
        '/src/__tests__/index.test.ts',  // Exclude generated hallucinated tests
        '/src/__tests__/unit/',
        '/src/__tests__/integration/'
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts',
        '!src/**/__tests__/**',
        '!src/index.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'json-summary'],
    verbose: true,
    // Isolate tests from env pollution
    resetMocks: true,
    restoreMocks: true,
    clearMocks: true
};

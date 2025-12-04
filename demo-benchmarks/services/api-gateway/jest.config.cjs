/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',

    // Let Jest discover all ts/tsx test files
    testMatch: [
        '**/__tests__/**/*.(test|spec).ts',
        '**/?(*.)+(test|spec).ts',
    ],

    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // Transform setup
    transform: {
        '^.+\\.(t|j)sx?$': 'ts-jest',
    },

    // Include test roots
    roots: ['<rootDir>/src', '<rootDir>/tests', '<rootDir>'],
};

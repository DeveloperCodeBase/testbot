import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { TestRunResult, TestSuiteResult } from '../models/TestRunResult';
import { EnvironmentIssue, AutoFixAction } from '../models/EnvironmentModels';
import { AdapterRegistry } from '../adapters/AdapterRegistry';
import { CommandRunner } from './CommandRunner';
import { BotConfig } from '../config/schema';
import logger from '../utils/logger';
import path from 'path';
import { fileExists, findFiles } from '../utils/fileUtils';
import { JestAutoFixLoop } from './JestAutoFixLoop';
import { PytestAutoFixLoop } from './PytestAutoFixLoop';
import { NodeEnvironmentHealer } from '../env/NodeEnvironmentHealer';
import { PythonEnvironmentHealer } from '../env/PythonEnvironmentHealer';
import { CoverageAnalyzer } from '../analyzer/CoverageAnalyzer';

/**
 * Executes tests and collects results
 */
export class TestExecutor {
    private adapterRegistry: AdapterRegistry;
    private commandRunner: CommandRunner;
    private config: BotConfig;
    private artifactsDir: string;

    constructor(config: BotConfig, artifactsDir: string) {
        this.adapterRegistry = new AdapterRegistry();
        this.commandRunner = new CommandRunner();
        this.config = config;
        this.artifactsDir = artifactsDir;
    }

    /**
     * Execute tests for a project
     */
    async executeTests(
        project: ProjectDescriptor,
        projectPath: string,
        testTypes: ('unit' | 'integration' | 'e2e')[],
        envIssues: EnvironmentIssue[] = [],
        envActions: AutoFixAction[] = [],
        generatedFiles: string[] = []
    ): Promise<TestRunResult> {
        logger.info(`Executing tests for project: ${project.name}`);

        const adapter = this.adapterRegistry.getAdapter(project);
        if (!adapter) {
            throw new Error(`No adapter found for project: ${project.name}`);
        }

        const testSuites: TestSuiteResult[] = [];
        const startTime = Date.now();

        // Build project if needed
        const buildCommand = adapter.getBuildCommand(project);
        if (buildCommand) {
            logger.info(`Building project: ${buildCommand}`);
            try {
                await this.commandRunner.execute(buildCommand, projectPath, this.config.execution.timeout);
            } catch (error) {
                logger.warn(`Build failed: ${error}`);
            }
        }

        // Auto-fix Loop (Dynamic Healing)
        // Run specific auto-fix loops based on language to ensure environment is ready
        if (project.language === 'typescript' || project.language === 'javascript') {
            const healer = new NodeEnvironmentHealer(this.config);
            const loop = new JestAutoFixLoop();
            const loopResult = await loop.executeWithAutoFix(project, projectPath, healer, generatedFiles);

            // Merge results
            envIssues.push(...loopResult.finalIssues);
            envActions.push(...loopResult.finalActions);

            if (!loopResult.success && loopResult.hardBlocker) {
                logger.error(`Jest auto-fix failed: ${loopResult.hardBlocker}`);
                // We can either return early or try to run anyway. 
                // If hard blocker, running will likely fail.
                // But let's let it fall through to standard execution which will report the failure details.
            }
        } else if (project.language === 'python') {
            const healer = new PythonEnvironmentHealer(this.config);
            const loop = new PytestAutoFixLoop();
            const loopResult = await loop.executeWithAutoFix(project, projectPath, healer, generatedFiles);

            envIssues.push(...loopResult.finalIssues);
            envActions.push(...loopResult.finalActions);

            if (!loopResult.success && loopResult.hardBlocker) {
                logger.error(`Pytest auto-fix failed: ${loopResult.hardBlocker}`);
            }
        }

        // Execute each test type
        for (const testType of testTypes) {
            if (!this.shouldRunTestType(testType)) {
                testSuites.push(this.createSkippedResult(testType, project));
                continue;
            }

            try {
                const result = await this.executeTestType(project, projectPath, testType, adapter, envIssues);
                testSuites.push(result);
            } catch (error) {
                logger.error(`Failed to execute ${testType} tests: ${error}`);
                testSuites.push(this.createFailedResult(testType, error as Error, project));
            }
        }

        const totalDuration = Date.now() - startTime;
        const overallStatus = this.determineOverallStatus(testSuites);

        // Parse coverage if enabled
        let coverage;
        if (this.config.coverage && this.config.coverage.threshold > 0) {
            try {
                const analyzer = new CoverageAnalyzer();
                const report = await analyzer.analyzeCoverage(project, projectPath);
                if (report) {
                    coverage = report;
                }
            } catch (error) {
                logger.warn(`Failed to parse coverage for ${project.name}: ${error}`);
            }
        }

        return {
            project: project.name,
            projectPath: project.path,
            language: project.language,
            framework: project.framework,
            testSuites,
            overallStatus,
            totalDuration,
            timestamp: new Date().toISOString(),
            generatedTestFiles: [],
            environmentIssues: envIssues,
            autoFixActions: envActions,
            coverage
        };
    }

    /**
     * Execute a specific test type
     */
    private async executeTestType(
        project: ProjectDescriptor,
        projectPath: string,
        testType: 'unit' | 'integration' | 'e2e',
        adapter: any,
        envIssues: EnvironmentIssue[]
    ): Promise<TestSuiteResult> {
        // Check if test directory exists
        const testDir = adapter.getTestDirectory(project, testType);
        const absoluteTestDir = path.resolve(projectPath, testDir);

        // Check if test directory exists
        if (!(await fileExists(absoluteTestDir))) {
            const reason = `Test directory not found: ${path.relative(projectPath, absoluteTestDir)}`;
            logger.info(`Skipping ${testType} tests for ${project.name}: ${reason}`);

            // Report as environment issue
            this.reportMissingTests(project, testType, reason, envIssues);

            return this.createSkippedResult(testType, project, reason);
        }

        // Check if there are any test files in the directory
        const pattern = adapter.getTestFilePattern(testType);
        const testFiles = await findFiles(absoluteTestDir, pattern);

        if (testFiles.length === 0) {
            const reason = `No test files found in ${path.relative(projectPath, absoluteTestDir)} matching ${pattern}`;
            logger.info(`Skipping ${testType} tests for ${project.name}: ${reason}`);

            // Report as environment issue
            this.reportMissingTests(project, testType, reason, envIssues);

            return this.createSkippedResult(testType, project, reason);
        }

        logger.info(`Found ${testFiles.length} ${testType} test files for ${project.name}`);

        const command = adapter.getTestCommand(project, testType);
        logger.info(`Running ${testType} tests: ${command}`);

        let result;

        // Use Auto-Fix Loop for Node/TypeScript projects
        if (project.language === 'typescript' || project.language === 'javascript') {
            const healer = new NodeEnvironmentHealer(this.config);
            const loop = new JestAutoFixLoop();
            // We pass empty generatedFiles array as we are in execution phase, not generation phase
            // The loop will still validate syntax of existing files
            const loopResult = await loop.executeWithAutoFix(project, projectPath, healer, [], command);

            // Merge any new issues/actions
            envIssues.push(...loopResult.finalIssues);
            // We don't have easy access to envActions here without changing signature, 
            // but issues are most important for reporting.

            // If success, we need to reconstruct a "success" result from the last run
            // Since executeWithAutoFix doesn't return the raw result, we might need to capture it
            // For now, let's fall back to running the command one last time to capture output/logs
            // OR modify JestAutoFixLoop to return the last execution result.

            // Simpler approach: If loop succeeded, run command one last time to get clean output for report
            // If loop failed, run command to capture failure output
            result = await this.commandRunner.execute(
                command,
                projectPath,
                this.config.execution.timeout
            );
        } else {
            result = await this.commandRunner.execute(
                command,
                projectPath,
                this.config.execution.timeout
            );
        }

        // Save logs
        const logsDir = path.join(this.artifactsDir, project.name, testType);
        const { stdoutPath } = await this.commandRunner.saveOutput(logsDir, result, 'test');

        // Parse test results from stdout/stderr
        const { testsRun, testsPassed, testsFailed, errors } = this.parseTestOutput(
            result.stdout,
            result.stderr,
            project.language
        );

        // Try to get coverage
        let coveragePath: string | undefined;
        if (testType === 'unit') {
            try {
                const coverageCommand = adapter.getCoverageCommand(project);
                if (coverageCommand) {
                    await this.commandRunner.execute(coverageCommand, projectPath, this.config.execution.timeout);
                    coveragePath = path.join(projectPath, 'coverage');
                }
            } catch (error) {
                logger.warn(`Failed to generate coverage: ${error}`);
            }
        }

        const testResult: TestSuiteResult = {
            type: testType,
            command,
            status: result.exitCode === 0 ? 'passed' : 'failed',
            exitCode: result.exitCode,
            logsPath: stdoutPath,
            coveragePath,
            duration: result.duration,
            testsRun,
            testsPassed,
            testsFailed,
            stdout: result.stdout,
            stderr: result.stderr,
            errors: errors.length > 0 ? errors : undefined,
        };

        // Analyze test failures to generate environment issues
        if (testResult.status === 'failed' && testResult.testsRun === 0) {
            this.analyzeTestFailure(project, testType, testResult, envIssues);
        }

        return testResult;
    }

    /**
     * Parse test output to extract test counts
     */
    private parseTestOutput(
        stdout: string,
        stderr: string,
        language: string
    ): { testsRun: number; testsPassed: number; testsFailed: number; errors: string[] } {
        const output = stdout + '\n' + stderr;
        let testsRun = 0;
        let testsPassed = 0;
        let testsFailed = 0;
        const errors: string[] = [];

        // Jest/Node.js patterns
        // Example: Tests: 5 passed, 1 failed, 6 total
        const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/);
        if (jestMatch) {
            testsFailed = jestMatch[1] ? parseInt(jestMatch[1]) : 0;
            testsPassed = parseInt(jestMatch[2]);
            testsRun = parseInt(jestMatch[3]);
        } else {
            // Try failed first pattern just in case: Tests: 1 failed, 5 passed, 6 total
            const jestMatchFailedFirst = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
            if (jestMatchFailedFirst) {
                testsFailed = parseInt(jestMatchFailedFirst[1]);
                testsPassed = parseInt(jestMatchFailedFirst[2]);
                testsRun = parseInt(jestMatchFailedFirst[3]);
            } else {
                // Vitest / Alternative Jest pattern
                // Vitest / Alternative Jest pattern
                // Tests  2 passed | 2 total
                const vitestMatch = output.match(/Tests\s+(\d+)\s+passed\s+\|\s+(\d+)\s+total/);
                if (vitestMatch) {
                    testsPassed = parseInt(vitestMatch[1]);
                    testsRun = parseInt(vitestMatch[2]);
                    testsFailed = testsRun - testsPassed;
                }
            }

            // Pytest patterns
            const pytestMatch = output.match(/(\d+)\s+passed/);
            if (pytestMatch && language === 'python') {
                testsPassed = parseInt(pytestMatch[1]);
                const failedMatch = output.match(/(\d+)\s+failed/);
                if (failedMatch) {
                    testsFailed = parseInt(failedMatch[1]);
                }
                // Check for skipped
                const skippedMatch = output.match(/(\d+)\s+skipped/);
                let testsSkipped = 0;
                if (skippedMatch) {
                    testsSkipped = parseInt(skippedMatch[1]);
                }
                testsRun = testsPassed + testsFailed + testsSkipped;
            }

            // JUnit patterns (basic)
            const junitMatch = output.match(/Tests run:\s+(\d+),\s+Failures:\s+(\d+)/);
            if (junitMatch && language === 'java') {
                testsRun = parseInt(junitMatch[1]);
                testsFailed = parseInt(junitMatch[2]);
                testsPassed = testsRun - testsFailed;
            }
        }

        // Extract error messages
        const errorPattern = /Error:|FAILED|AssertionError|Exception/g;
        const errorMatches = output.match(errorPattern);
        if (errorMatches) {
            // Extract a few lines around each error
            const lines = output.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (errorPattern.test(lines[i])) {
                    const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');
                    errors.push(context);
                    if (errors.length >= 5) break; // Limit to 5 errors
                }
            }
        }

        return { testsRun, testsPassed, testsFailed, errors };
    }

    /**
     * Check if a test type should run based on config
     */
    private shouldRunTestType(testType: 'unit' | 'integration' | 'e2e'): boolean {
        return this.config.enabled_tests[testType];
    }

    /**
     * Create a skipped test result
     */
    private createSkippedResult(testType: 'unit' | 'integration' | 'e2e', _project: ProjectDescriptor, reason?: string): TestSuiteResult {
        return {
            type: testType,
            command: reason || `${testType} tests not configured or no tests found`,
            status: 'skipped',
            exitCode: 0,
            logsPath: '',
            duration: 0,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
        };
    }

    /**
     * Create a failed test result from error
     */
    private createFailedResult(testType: 'unit' | 'integration' | 'e2e', error: Error, _project: ProjectDescriptor): TestSuiteResult {
        return {
            type: testType,
            command: '',
            status: 'failed',
            exitCode: 1,
            logsPath: '',
            duration: 0,
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
            errors: [error.message],
        };
    }

    /**
     * Determine overall test status
     */
    private determineOverallStatus(testSuites: TestSuiteResult[]): 'passed' | 'failed' | 'partial' {
        const hasFailures = testSuites.some(suite => suite.status === 'failed');
        const hasPasses = testSuites.some(suite => suite.status === 'passed');
        const hasSkipped = testSuites.some(suite => suite.status === 'skipped');

        if (hasFailures && hasPasses) return 'partial';
        if (hasFailures) return 'failed';
        if (hasPasses) return 'passed';
        // If all skipped, return failed to alert user (no silent success)
        if (hasSkipped) return 'failed';
        return 'passed';
    }

    private analyzeTestFailure(
        project: ProjectDescriptor,
        testType: string,
        testResult: TestSuiteResult,
        envIssues: EnvironmentIssue[]
    ): void {
        const stdout = testResult.stdout || '';
        const stderr = testResult.stderr || '';
        const combined = stdout + '\n' + stderr;

        // Helper to check if issue already exists
        const issueExists = (code: string, filePath?: string): boolean => {
            return envIssues.some(i =>
                i.project === project.name &&
                i.code === code &&
                (!filePath || i.filePath === filePath)
            );
        };

        // Detect TypeScript configuration issues with Jest
        if ((project.language === 'javascript' || project.language === 'typescript')) {
            // Check for TypeScript-specific syntax in error messages
            const tsPatterns = [
                /type\s+\w+\s*=/,           // type definitions
                /import\s+type\s+/,         // import type
                /:\s*\w+(<[^>]+>)?;/,       // type annotations
                /as\s+jest\.Mocked</,       // jest.Mocked<...>
                /jest\.SpyInstance/,        // jest.SpyInstance
                /@babel\/parser/,           // Babel parser errors
            ];

            const hasTypeScriptSyntax = tsPatterns.some(pattern => pattern.test(combined));
            const hasSyntaxError = combined.includes('SyntaxError') ||
                combined.includes('Unexpected token') ||
                combined.includes('Missing semicolon');

            // If we have TS syntax in a .ts/.tsx file with syntax errors, it's likely a config issue
            const isTypeScriptFile = /\.tsx?['"]?\s*\(?\d+:\d+\)?/.test(combined);

            if (hasTypeScriptSyntax && hasSyntaxError && isTypeScriptFile) {
                // Extract real file path and location from Jest error
                const filePathMatch = combined.match(/(?:at\s+|●\s+|SyntaxError:\s+)([^:\n]+\.test\.tsx?)[:\s]*(?:\((\d+):(\d+)\))?/) ||
                    combined.match(/([^:\n]+\.tsx?)[:\s]*\((\d+):(\d+)\)/);

                let filePath = 'jest.config.js';
                let details = 'Jest is not configured to handle TypeScript syntax in test files';

                if (filePathMatch) {
                    const extractedPath = filePathMatch[1];
                    const line = filePathMatch[2];
                    const col = filePathMatch[3];

                    // Extract just the project-relative path, not Babel internals
                    if (!extractedPath.includes('node_modules') &&
                        !extractedPath.includes('@babel')) {
                        filePath = extractedPath;
                        details = `Jest cannot parse TypeScript syntax at ${extractedPath}`;
                        if (line && col) {
                            details += ` (line ${line}, column ${col})`;
                        }
                    }
                }

                if (!issueExists('JEST_TS_CONFIG_ERROR')) {
                    envIssues.push({
                        project: project.name,
                        code: 'JEST_TS_CONFIG_ERROR',
                        message: 'Jest is not configured to handle TypeScript syntax in test files',
                        severity: 'error',
                        stage: 'execution',
                        details,
                        filePath: filePath.replace(/^.*?src\//, 'src/'), // Normalize path
                        autoFixed: false,
                        remediation: [{
                            title: 'Configure Jest for TypeScript',
                            description: 'Configure ts-jest or Babel with @babel/preset-typescript in jest.config.js. Ensure transform covers *.test.ts and *.spec.ts files, and testMatch/testRegex includes TypeScript test patterns.',
                            filePath: 'jest.config.js'
                        }]
                    });
                }
                return; // Don't also add generic syntax error
            }

            // Generic JavaScript/TypeScript syntax errors (not TypeScript config issues)
            if (hasSyntaxError && !hasTypeScriptSyntax) {
                // Try to extract file path and line number
                const fileMatch = combined.match(/at\s+([^:\n]+):(\d+):(\d+)/) ||
                    combined.match(/([^:\n]+\.test\.[jt]sx?)[:\s]*(\d+):(\d+)/);

                let details = 'Syntax error in generated test files';
                let filePath = 'Generated test files';

                if (fileMatch) {
                    const extractedPath = fileMatch[1];
                    const line = fileMatch[2];
                    const col = fileMatch[3];

                    // Only use paths that are actually project files
                    if (!extractedPath.includes('node_modules') &&
                        !extractedPath.includes('@babel') &&
                        (extractedPath.includes('src/') || extractedPath.includes('tests/'))) {
                        filePath = extractedPath.replace(/^.*?src\//, 'src/');
                        details = `Syntax error at ${filePath}:${line}:${col}`;
                    }
                }

                if (!issueExists('TEST_SYNTAX_ERROR', filePath)) {
                    envIssues.push({
                        project: project.name,
                        code: 'TEST_SYNTAX_ERROR',
                        message: 'JavaScript/TypeScript syntax error in test files',
                        severity: 'error',
                        stage: 'execution',
                        details,
                        filePath,
                        autoFixed: false,
                        remediation: [{
                            title: 'Fix syntax errors',
                            description: 'Review and fix syntax errors in generated test files. Check for missing semicolons, unexpected tokens, or invalid syntax.',
                            filePath
                        }]
                    });
                }
            }
        }

        if (project.framework === 'react' || project.testFramework === 'vitest') {
            if (combined.includes("Failed to resolve import '@testing-library/user-event'") &&
                !issueExists('MISSING_DEV_DEP')) {
                envIssues.push({
                    project: project.name,
                    code: 'MISSING_DEV_DEP',
                    message: 'Missing @testing-library/user-event dependency',
                    severity: 'error',
                    stage: 'execution',
                    details: '@testing-library/user-event',
                    filePath: 'package.json',
                    autoFixed: false,
                    remediation: [{
                        title: 'Install missing dependency',
                        description: 'Install @testing-library/user-event as a dev dependency',
                        command: 'npm install -D @testing-library/user-event',
                        filePath: 'package.json'
                    }]
                });
            }

            if (combined.includes('Invalid Chai property') &&
                (combined.includes('toBeInTheDocument') || combined.includes('toBeEnabled') ||
                    combined.includes('toBeDisabled') || combined.includes('toHaveValue')) &&
                !issueExists('MISSING_MATCHERS_CONFIG')) {
                envIssues.push({
                    project: project.name,
                    code: 'MISSING_MATCHERS_CONFIG',
                    message: 'Missing jest-dom matchers configuration for Vitest',
                    severity: 'error',
                    stage: 'execution',
                    details: 'Vitest needs setupFiles to import @testing-library/jest-dom/vitest',
                    filePath: 'vitest.config.ts',
                    autoFixed: false,
                    remediation: [
                        {
                            title: 'Create setupTests.ts',
                            description: "Create src/setupTests.ts with import '@testing-library/jest-dom/vitest';",
                            command: "echo \"import '@testing-library/jest-dom/vitest';\" > src/setupTests.ts",
                            filePath: 'src/setupTests.ts'
                        },
                        {
                            title: 'Update vitest.config.ts',
                            description: 'Add setupFiles: ["./src/setupTests.ts"] to test configuration',
                            filePath: 'vitest.config.ts'
                        }
                    ]
                });
            }

            if (combined.includes('Cannot redefine property: useNavigate') &&
                !issueExists('INVALID_ROUTER_MOCK')) {
                envIssues.push({
                    project: project.name,
                    code: 'INVALID_ROUTER_MOCK',
                    message: 'Invalid react-router-dom mocking approach',
                    severity: 'error',
                    stage: 'execution',
                    details: 'Use module-level vi.mock instead of vi.spyOn for useNavigate',
                    filePath: 'Test files using useNavigate',
                    autoFixed: false,
                    remediation: [{
                        title: 'Fix router mocking',
                        description: 'Use vi.mock("react-router-dom", async (importOriginal) => { ... }) at module level instead of vi.spyOn',
                        filePath: 'Test files using useNavigate (e.g., LoginPage.test.tsx, OrdersPage.test.tsx)'
                    }]
                });
            }
        }

        if (project.testFramework === 'jest') {
            if ((combined.includes('No tests found') || combined.includes('no tests to run')) &&
                !issueExists('NO_TESTS_FOUND')) {
                envIssues.push({
                    project: project.name,
                    code: 'NO_TESTS_FOUND',
                    message: `No ${testType} tests found by Jest`,
                    severity: 'error',
                    stage: 'execution',
                    details: `Jest testPathPattern might not match generated test locations`,
                    filePath: 'jest.config.js',
                    autoFixed: false,
                    remediation: [{
                        title: 'Adjust Jest configuration',
                        description: 'Update jest.config.js to include correct roots and testMatch patterns',
                        filePath: 'jest.config.js'
                    }]
                });
            }
        }

        if (project.language === 'java') {
            if ((combined.includes('MojoFailureException') || combined.includes('[ERROR]') ||
                combined.includes('CompilationFailureException')) &&
                !issueExists('JAVA_BUILD_FAILED')) {
                envIssues.push({
                    project: project.name,
                    code: 'JAVA_BUILD_FAILED',
                    message: 'Maven build/test compilation failed',
                    severity: 'error',
                    stage: 'execution',
                    details: 'Check Maven error logs for compilation or test execution errors',
                    filePath: 'pom.xml',
                    autoFixed: false,
                    remediation: [{
                        title: 'Check Maven logs',
                        description: 'Review the test output for specific compilation or test errors in generated test classes',
                        filePath: 'pom.xml or test source files'
                    }]
                });
            }
        }

        // Only add generic failure if no specific issue was detected
        if (!envIssues.some(i => i.project === project.name && i.stage === 'execution')) {
            envIssues.push({
                project: project.name,
                code: 'TEST_EXECUTION_FAILED',
                message: `${testType} tests failed with exit code ${testResult.exitCode}`,
                severity: 'error',
                stage: 'execution',
                details: `Tests ran: ${testResult.testsRun}, Command: ${testResult.command}`,
                filePath: `${testType} test suite`,
                autoFixed: false,
                remediation: [{
                    title: 'Review test output',
                    description: 'Check stdout/stderr for specific error messages in the test execution logs',
                }]
            });
        }
    }

    private reportMissingTests(
        project: ProjectDescriptor,
        testType: string,
        reason: string,
        envIssues: EnvironmentIssue[]
    ): void {
        let configFile = 'test configuration';
        if (project.testFramework === 'jest') {
            configFile = 'jest.config.js';
        } else if (project.testFramework === 'vitest') {
            configFile = 'vitest.config.ts';
        } else if (project.testFramework === 'pytest') {
            configFile = 'pytest.ini';
        } else if (project.language === 'java') {
            configFile = 'pom.xml';
        }

        envIssues.push({
            project: project.name,
            code: 'NO_TESTS_FOUND',
            message: `No ${testType} tests found or executed`,
            severity: 'error',
            stage: 'execution',
            details: reason,
            autoFixed: false,
            remediation: [{
                title: 'Verify Test Location',
                description: `Ensure tests are generated in the correct directory or update test discovery patterns. ${reason}`,
                filePath: configFile
            }]
        });
    }
}

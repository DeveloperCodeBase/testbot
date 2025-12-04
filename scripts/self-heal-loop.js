#!/usr/bin/env node
/**
 * Autonomous Self-Healing Loop
 * 
 * Runs testbot on itself AND the demo project.
 */

const { execSync } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const path = require('path');

const MAX_ITERATIONS = 5;
const ARTIFACTS_DIR = './artifacts/self-test-loop';
const DEMO_PROJECT_PATH = './demo-benchmarks';

console.log('🚀 Starting Autonomous Self-Healing Loop (Dual Target)');
console.log(`Target: ${MAX_ITERATIONS} iterations max`);

for (let i = 1; i <= MAX_ITERATIONS; i++) {
    console.log(`\n\n==================================================`);
    console.log(`🔄 Iteration ${i}/${MAX_ITERATIONS}`);
    console.log(`==================================================\n`);

    try {
        // Step 1: Build
        console.log('📦 Building testbot...');
        execSync('npm run build', { stdio: 'inherit' });

        // Step 2: Run on Self
        const selfOutputDir = `${ARTIFACTS_DIR}/run-${i}-self`;
        console.log(`🧪 Running on SELF (Output: ${selfOutputDir})...`);
        try {
            execSync(`node dist/cli/index.js analyze . --auto-fix --coverage-threshold 80 --output ${selfOutputDir}`, {
                stdio: 'inherit'
            });
        } catch (error) {
            console.log('⚠️  Self-run failed (exit code non-zero)');
        }

        // Step 3: Run on Demo
        const demoOutputDir = `${ARTIFACTS_DIR}/run-${i}-demo`;
        console.log(`🧪 Running on DEMO (Output: ${demoOutputDir})...`);
        try {
            execSync(`node dist/cli/index.js analyze ${DEMO_PROJECT_PATH} --auto-fix --coverage-threshold 80 --output ${demoOutputDir}`, {
                stdio: 'inherit'
            });
        } catch (error) {
            console.log('⚠️  Demo-run failed (exit code non-zero)');
        }

        // Step 4: Analyze Results
        const analyzeRun = (name, outputDir) => {
            if (!existsSync(outputDir)) return { name, status: 'missing' };

            const getDirectories = source =>
                require('fs').readdirSync(source, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

            const subdirs = getDirectories(outputDir);
            if (subdirs.length === 0) return { name, status: 'no-job-dir' };

            const jobDir = subdirs[0];
            const resultsPath = path.join(outputDir, jobDir, 'results.json');

            if (!existsSync(resultsPath)) return { name, status: 'no-results-json' };

            const results = JSON.parse(readFileSync(resultsPath, 'utf-8'));
            return { name, status: results.overallStatus || results.status, results };
        };

        const selfResult = analyzeRun('Self', selfOutputDir);
        const demoResult = analyzeRun('Demo', demoOutputDir);

        console.log(`\n📊 Analysis Results for Iteration ${i}:`);

        const logResult = (res) => {
            console.log(`   [${res.name}] Status: ${res.status}`);
            if (res.results) {
                console.log(`      Tests: ${res.results.summary?.passedTests || 0} passed, ${res.results.summary?.failedTests || 0} failed`);
                if (res.results.autoFixActions?.length > 0) {
                    console.log(`      Auto-fixes: ${res.results.autoFixActions.length}`);
                }
                if (res.results.environmentIssues?.length > 0) {
                    console.log(`      Issues: ${res.results.environmentIssues.length}`);
                    res.results.environmentIssues.forEach(issue => {
                        console.log(`         - [${issue.code}] ${issue.message}`);
                    });
                }
            }
        };

        logResult(selfResult);
        logResult(demoResult);

        // Check for success
        const selfPassed = selfResult.status === 'passed' || selfResult.status === 'success';
        const demoPassed = demoResult.status === 'passed' || demoResult.status === 'success';

        if (selfPassed && demoPassed) {
            console.log('\n🎉 SUCCESS! All tests passed on both targets.');
            process.exit(0);
        }

        if (i === MAX_ITERATIONS) {
            console.error('\n❌ Max iterations reached without full success.');
            process.exit(1);
        }

        console.log('\n🔄 Proceeding to next iteration...');

    } catch (error) {
        console.error('❌ Unexpected error in loop:', error);
        process.exit(1);
    }
}

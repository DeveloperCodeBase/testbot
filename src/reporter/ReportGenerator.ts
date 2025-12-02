import { JobResult } from '../models/TestRunResult.js';
import { writeFile } from '../utils/fileUtils.js';
import logger from '../utils/logger.js';
import path from 'path';

/**
 * Generates reports from job results
 */
export class ReportGenerator {
    /**
     * Generate reports
     */
    async generateReports(
        result: JobResult,
        outputDir: string,
        formats: ('json' | 'html')[]
    ): Promise<{ jsonPath?: string; htmlPath?: string }> {
        const paths: { jsonPath?: string; htmlPath?: string } = {};

        if (formats.includes('json')) {
            paths.jsonPath = await this.generateJSON(result, outputDir);
        }

        if (formats.includes('html')) {
            paths.htmlPath = await this.generateHTML(result, outputDir);
        }

        return paths;
    }

    /**
     * Generate JSON report
     */
    private async generateJSON(result: JobResult, outputDir: string): Promise<string> {
        const jsonPath = path.join(outputDir, 'results.json');
        const content = JSON.stringify(result, null, 2);
        await writeFile(jsonPath, content);
        logger.info(`JSON report generated: ${jsonPath}`);
        return jsonPath;
    }

    /**
     * Generate HTML report
     */
    private async generateHTML(result: JobResult, outputDir: string): Promise<string> {
        const htmlPath = path.join(outputDir, 'results.html');
        const html = this.buildHTML(result);
        await writeFile(htmlPath, html);
        logger.info(`HTML report generated: ${htmlPath}`);
        return htmlPath;
    }

    /**
     * Build HTML content
     */
    private buildHTML(result: JobResult): string {
        const statusColor = result.status === 'success' ? '#22c55e' : result.status === 'failed' ? '#ef4444' : '#f59e0b';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Bot Results - ${result.jobId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f3f4f6;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            padding: 30px;
        }
        h1 {
            color: #111827;
            margin-bottom: 10px;
        }
        .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 4px;
            font-weight: 600;
            color: white;
            background: ${statusColor};
            margin-bottom: 20px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .summary-card {
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
        }
        .summary-card h3 {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .summary-card .value {
            color: #111827;
            font-size: 32px;
            font-weight: 700;
        }
        .project {
            margin: 30px 0;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
        }
        .project h2 {
            color: #111827;
            margin-bottom: 15px;
        }
        .test-suite {
            margin: 15px 0;
            padding: 15px;
            background: #f9fafb;
            border-radius: 6px;
        }
        .test-suite h4 {
            color: #374151;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge.passed { background: #dcfce7; color: #166534; }
        .badge.failed { background: #fee2e2; color: #991b1b; }
        .badge.skipped { background: #f3f4f6; color: #6b7280; }
        .info { color: #6b7280; font-size: 14px; margin-top: 10px; }
        .errors {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            padding: 15px;
            margin-top: 15px;
        }
        .errors h5 {
            color: #991b1b;
            margin-bottom: 10px;
        }
        .error-item {
            background: white;
            padding: 10px;
            border-radius: 4px;
            margin: 5px 0;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #374151;
        }
        .generated-files {
            margin-top: 20px;
            padding: 15px;
            background: #eff6ff;
            border-radius: 6px;
            border: 1px solid #dbeafe;
        }
        .generated-files h4 {
            color: #1e40af;
            margin-bottom: 10px;
        }
        .generated-files ul {
            list-style: none;
            padding-left: 0;
        }
        .generated-files li {
            font-family: 'Courier New', monospace;
            font-size: 13px;
            color: #1e3a8a;
            padding: 4px 0;
            border-bottom: 1px solid #dbeafe;
        }
        .generated-files li:last-child {
            border-bottom: none;
        }
        .env-section {
            margin: 30px 0;
            background: #fff;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            padding: 20px;
        }
        .env-section h2 {
            color: #111827;
            margin-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 10px;
        }
        .auto-fix-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        .auto-fix-table th, .auto-fix-table td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        .auto-fix-table th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        .status-icon.success { color: #22c55e; }
        .status-icon.failed { color: #ef4444; }
        .issue-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-left: 4px solid #6b7280;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .issue-card.error { border-left-color: #ef4444; }
        .issue-card.warning { border-left-color: #f59e0b; }
        .issue-card.info { border-left-color: #3b82f6; }
        .issue-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .issue-title { font-weight: 700; color: #111827; }
        .remediation {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 6px;
            margin-top: 10px;
        }
        .remediation h5 {
            color: #374151;
            margin-bottom: 8px;
            font-size: 14px;
        }
        .remediation-step {
            margin-bottom: 10px;
            font-size: 14px;
        }
        .cmd-block {
            background: #1f2937;
            color: #e5e7eb;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            margin-top: 5px;
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Test Bot Results</h1>
        <div class="status">${result.status.toUpperCase()}</div>
        
        <div class="summary">
            <div class="summary-card">
                <h3>Projects</h3>
                <div class="value">${result.summary.totalProjects}</div>
            </div>
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value">${result.summary.totalTests}</div>
            </div>
            <div class="summary-card">
                <h3>Passed</h3>
                <div class="value" style="color: #22c55e;">${result.summary.passedTests}</div>
            </div>
            <div class="summary-card">
                <h3>Failed</h3>
                <div class="value" style="color: #ef4444;">${result.summary.failedTests}</div>
            </div>
        </div>

        <div class="info">
            <strong>Job ID:</strong> ${result.jobId}<br>
            <strong>Duration:</strong> ${(result.duration / 1000).toFixed(2)}s<br>
            <strong>Started:</strong> ${new Date(result.startTime).toLocaleString()}<br>
            <strong>Ended:</strong> ${new Date(result.endTime).toLocaleString()}<br>
            ${result.repoUrl ? `<strong>Repository:</strong> ${result.repoUrl}<br>` : ''}
            <strong>Generated Test Files:</strong> ${result.generatedTestFiles.length}
            <strong>Generated Test Files:</strong> ${result.generatedTestFiles.length}
        </div>

        ${(result.autoFixActions && result.autoFixActions.length > 0) || (result.environmentIssues && result.environmentIssues.length > 0) ? `
        <div class="env-section">
            <h2>Environment & Auto-Fix</h2>
            
            ${result.autoFixActions && result.autoFixActions.length > 0 ? `
            <h3>Auto-Fix Actions (${result.autoFixActions.length})</h3>
            <table class="auto-fix-table">
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Action</th>
                        <th>Command</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.autoFixActions.map(action => `
                    <tr>
                        <td>${action.project}</td>
                        <td>${action.description}</td>
                        <td><code>${action.command}</code></td>
                        <td>
                            <span class="status-icon ${action.success ? 'success' : 'failed'}">
                                ${action.success ? '✓ Success' : '✗ Failed'}
                            </span>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}

            ${result.environmentIssues && result.environmentIssues.length > 0 ? `
            <h3>Environment Issues (${result.environmentIssues.length})</h3>
            ${result.environmentIssues.map(issue => `
            <div class="issue-card ${issue.severity}">
                <div class="issue-header">
                    <span class="issue-title">[${issue.code}] ${issue.message}</span>
                    <span class="badge ${issue.autoFixed ? 'passed' : 'failed'}">
                        ${issue.autoFixed ? 'Auto-Fixed' : 'Outstanding'}
                    </span>
                </div>
                <p>${issue.details || ''}</p>
                
                ${!issue.autoFixed && issue.remediation ? `
                <div class="remediation">
                    <h5>Remediation Steps:</h5>
                    ${issue.remediation.map(step => `
                    <div class="remediation-step">
                        <strong>${step.title}</strong>: ${step.description}
                        ${step.command ? `<code class="cmd-block">${step.command}</code>` : ''}
                        ${step.filePath ? `<code class="cmd-block">File: ${step.filePath}</code>` : ''}
                    </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>
            `).join('')}
            ` : ''}
        </div>
        ` : ''}

        ${result.projectResults.map(project => `
            <div class="project">
                <h2>${project.project}</h2>
                <div class="info">
                    <strong>Language:</strong> ${project.language}
                    ${project.framework ? ` | <strong>Framework:</strong> ${project.framework}` : ''}
                </div>

                ${project.testSuites.map(suite => `
                    <div class="test-suite">
                        <h4>
                            ${suite.type.toUpperCase()} Tests
                            <span class="badge ${suite.status}">${suite.status}</span>
                        </h4>
                        <div class="info">
                            <strong>Command:</strong> <code>${suite.command || 'N/A'}</code><br>
                            <strong>Tests Run:</strong> ${suite.testsRun} | 
                            <strong>Passed:</strong> ${suite.testsPassed} | 
                            <strong>Failed:</strong> ${suite.testsFailed}<br>
                            <strong>Duration:</strong> ${(suite.duration / 1000).toFixed(2)}s
                        </div>
                        ${suite.errors && suite.errors.length > 0 ? `
                            <div class="errors">
                                <h5>Errors:</h5>
                                ${suite.errors.map(err => `<div class="error-item">${this.escapeHtml(err)}</div>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}

                ${project.generatedTestFiles && project.generatedTestFiles.length > 0 ? `
                    <div class="generated-files">
                        <h4>AI-Generated Tests (${project.generatedTestFiles.length})</h4>
                        <ul>
                            ${project.generatedTestFiles.map(file => `<li>${path.relative(result.repoPath, file)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `).join('')}

        ${result.errors.length > 0 ? `
            <div class="errors">
                <h5>Job Errors:</h5>
                ${result.errors.map(err => `<div class="error-item">${this.escapeHtml(err)}</div>`).join('')}
            </div>
        ` : ''
            }
</div>
    </body>
    </html>`;
    }

    /**
     * Escape HTML
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

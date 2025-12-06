import { JobResult, TestRunResult } from '../models/TestRunResult';
import { writeFile } from '../utils/fileUtils';
import path from 'path';
import logger from '../utils/logger';

/**
 * Generates HTML reports for test execution results
 */
export class HtmlReportGenerator {

    async generateReport(result: JobResult, outputDir: string): Promise<string> {
        const reportPath = path.join(outputDir, 'results.html');
        const html = this.buildHtml(result);
        await writeFile(reportPath, html);
        logger.info(`Generated HTML report: ${reportPath}`);
        return reportPath;
    }

    private buildHtml(result: JobResult): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TestBot Report - ${result.jobId}</title>
    ${this.getStyles()}
</head>
<body>
    <div class="container">
        ${this.buildHeader(result)}
        ${this.buildSummary(result)}
        ${this.buildIssuesSection(result)}
        ${this.buildProjectSection(result)}
        ${this.buildEnvironmentSection(result)}
        ${this.buildFooter(result)}
    </div>
    ${this.getScripts()}
</body>
</html>`;
    }

    private buildHeader(result: JobResult): string {
        const statusClass = result.status === 'success' ? 'success' : result.status === 'partial' ? 'warning' : 'error';
        return `
        <header>
            <h1>🤖 Autonomous Test Bot Report</h1>
            <div class="header-info">
                <div class="status-badge ${statusClass}">${result.status.toUpperCase()}</div>
                <div class="meta">
                    <div><strong>Job ID:</strong> ${result.jobId}</div>
                    <div><strong>Repository:</strong> ${result.repoUrl || result.repoPath}</div>
                    <div><strong>Duration:</strong> ${this.formatDuration(result.duration)}</div>
                    <div><strong>Completed:</strong> ${new Date(result.endTime).toLocaleString()}</div>
                </div>
            </div>
        </header>`;
    }

    private buildSummary(result: JobResult): string {
        const summary = result.summary;
        const coveragePct = summary.overallCoverage?.toFixed(2) || 'N/A';

        return `
        <section class="summary">
            <h2>📊 Summary</h2>
            <div class="metrics-grid">
                <div class="metric">
                    <div class="metric-value">${summary.totalProjects}</div>
                    <div class="metric-label">Projects</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${summary.totalTests}</div>
                    <div class="metric-label">Total Tests</div>
                </div>
                <div class="metric ${summary.passedTests === summary.totalTests ? 'success' : ''}">
                    <div class="metric-value">${summary.passedTests}</div>
                    <div class="metric-label">Passed</div>
                </div>
                <div class="metric ${summary.failedTests > 0 ? 'error' : ''}">
                    <div class="metric-value">${summary.failedTests}</div>
                    <div class="metric-label">Failed</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${coveragePct}%</div>
                    <div class="metric-label">Coverage</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${result.generatedTestFiles.length}</div>
                    <div class="metric-label">Generated Files</div>
                </div>
            </div>
            ${summary.reason ? `<div class="alert warning"><strong>Note:</strong> ${summary.reason}</div>` : ''}
        </section>`;
    }

    private buildIssuesSection(result: JobResult): string {
        if (!result.issues || result.issues.length === 0) {
            return '';
        }

        // Group issues by severity
        const errors = result.issues.filter(i => i.severity === 'error');
        const warnings = result.issues.filter(i => i.severity === 'warning');
        const infos = result.issues.filter(i => i.severity === 'info');

        const getSeverityIcon = (severity: string) => {
            switch (severity) {
                case 'error': return '🔴';
                case 'warning': return '⚠️';
                case 'info': return '💡';
                default: return '•';
            }
        };

        const buildIssueCard = (issue: any) => {
            // Find matching auto-fix actions for this issue
            const relatedActions = result.autoFixActions.filter(action =>
                action.project === issue.project &&
                action.description.toLowerCase().includes(issue.kind.toLowerCase())
            );

            return `
            <div class="issue-card ${issue.severity}">
                <div class="issue-header-line">
                    <span class="issue-severity-icon">${getSeverityIcon(issue.severity)}</span>
                    <span class="issue-project-badge">${issue.project}</span>
                    <span class="issue-stage-badge">${issue.stage}</span>
                    <span class="issue-kind-badge">${issue.kind}</span>
                </div>
                <div class="issue-message">${issue.message}</div>
                ${issue.details ? `<div class="issue-details"><strong>Details:</strong> ${issue.details}</div>` : ''}
                ${issue.suggestion ? `
                <div class="issue-suggestion">
                    <strong>💡 Suggestion:</strong> ${issue.suggestion}
                </div>
                ` : ''}
                ${relatedActions.length > 0 ? `
                <div class="issue-fixes">
                    <strong>🔧 Auto-Fix Applied:</strong>
                    ${relatedActions.map(action => `
                    <div class="fix-action ${action.success ? 'success' : 'failed'}">
                        ${action.success ? '✅' : '❌'} ${action.description}
                        ${action.command ? `<code>${action.command}</code>` : ''}
                    </div>
                    `).join('')}
                </div>
                ` : ''}
                ${issue.modelName ? `<div class="issue-llm"><strong>Model:</strong> ${issue.modelName} ${issue.taskType ? `(${issue.taskType})` : ''}</div>` : ''}
            </div>`;
        };

        return `
        <section class="issues-section">
            <h2>🚨 Issues & Diagnostics</h2>
            <div class="issues-summary">
                ${errors.length > 0 ? `<div class="issue-count error-count">❌ ${errors.length} Error${errors.length > 1 ? 's' : ''}</div>` : ''}
                ${warnings.length > 0 ? `<div class="issue-count warning-count">⚠️ ${warnings.length} Warning${warnings.length > 1 ? 's' : ''}</div>` : ''}
                ${infos.length > 0 ? `<div class="issue-count info-count">💡 ${infos.length} Info</div>` : ''}
            </div>
            
            ${errors.length > 0 ? `
            <div class="issues-group">
                <h3 class="issues-group-title error-title">Errors</h3>
                ${errors.map(issue => buildIssueCard(issue)).join('')}
            </div>
            ` : ''}
            
            ${warnings.length > 0 ? `
            <div class="issues-group">
                <h3 class="issues-group-title warning-title">Warnings</h3>
                ${warnings.slice(0, 10).map(issue => buildIssueCard(issue)).join('')}
                ${warnings.length > 10 ? `<div class="alert info">...and ${warnings.length - 10} more warnings. See JSON report for complete list.</div>` : ''}
            </div>
            ` : ''}
            
            ${infos.length > 0 ? `
            <div class="issues-group">
                <h3 class="issues-group-title info-title">Informational</h3>
                ${infos.slice(0, 5).map(issue => buildIssueCard(issue)).join('')}
                ${infos.length > 5 ? `<div class="alert info">...and ${infos.length - 5} more info items.</div>` : ''}
            </div>
            ` : ''}
        </section>`;
    }

    private buildProjectSection(result: JobResult): string {
        if (result.projectResults.length === 0) {
            return '<section><p>No project results to display.</p></section>';
        }

        return `
        <section class="projects">
            <h2>📁 Projects</h2>
            ${result.projectResults.map((project, idx) => this.buildProjectDetails(project, idx)).join('')}
        </section>`;
    }

    private buildProjectDetails(project: TestRunResult, index: number): string {
        const totalTests = project.testSuites.reduce((sum, s) => sum + s.testsRun, 0);
        const passedTests = project.testSuites.reduce((sum, s) => sum + s.testsPassed, 0);
        const failedTests = project.testSuites.reduce((sum, s) => sum + s.testsFailed, 0);
        const statusClass = project.overallStatus === 'passed' ? 'success' : project.overallStatus === 'partial' ? 'warning' : 'error';
        const coveragePct = project.coverage?.overall?.statements?.pct?.toFixed(2) || 'N/A';

        return `
        <div class="project-card">
            <div class="project-header" onclick="toggleSection('project-${index}')">
                <div class="project-title">
                    <h3>${project.project}</h3>
                    <div class="badge ${statusClass}">${project.overallStatus}</div>
                    <span class="language-badge">${project.language}</span>
                    ${project.framework ? `<span class="framework-badge">${project.framework}</span>` : ''}
                </div>
                <div class="project-stats">
                    <span>Tests: ${passedTests}/${totalTests}</span>
                    ${failedTests > 0 ? `<span class="failed-tests">Failed: ${failedTests}</span>` : ''}
                    <span>Coverage: ${coveragePct}%</span>
                    <span class="toggle-icon">▼</span>
                </div>
            </div>
            <div id="project-${index}" class="project-body">
                ${this.buildTestSuites(project)}
                ${this.buildCoverage(project)}
                ${this.buildProjectIssues(project)}
                ${this.buildProjectActions(project)}
            </div>
        </div>`;
    }

    private buildTestSuites(project: TestRunResult): string {
        if (project.testSuites.length === 0) {
            return '<div class="alert info">No test suites executed.</div>';
        }

        return `
        <div class="test-suites">
            <h4>Test Suites</h4>
            <table class="suite-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Tests Run</th>
                        <th>Passed</th>
                        <th>Failed</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${project.testSuites.map(suite => `
                    <tr class="${suite.status}">
                        <td>${suite.type}</td>
                        <td><span class="badge ${suite.status === 'passed' ? 'success' : suite.status === 'skipped' ? 'info' : 'error'}">${suite.status}</span></td>
                        <td>${suite.testsRun}</td>
                        <td>${suite.testsPassed}</td>
                        <td>${suite.testsFailed}</td>
                        <td>${this.formatDuration(suite.duration)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    private buildCoverage(project: TestRunResult): string {
        if (!project.coverage) {
            return '<div class="alert info">No coverage data available.</div>';
        }

        const cov = project.coverage.overall;
        return `
        <div class="coverage">
            <h4>Coverage Metrics</h4>
            <div class="coverage-grid">
                <div class="coverage-item">
                    <div class="coverage-label">Statements</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${cov.statements.pct}%"></div>
                    </div>
                    <div class="coverage-value">${cov.statements.pct.toFixed(2)}% (${cov.statements.covered}/${cov.statements.total})</div>
                </div>
                <div class="coverage-item">
                    <div class="coverage-label">Branches</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${cov.branches.pct}%"></div>
                    </div>
                    <div class="coverage-value">${cov.branches.pct.toFixed(2)}% (${cov.branches.covered}/${cov.branches.total})</div>
                </div>
                <div class="coverage-item">
                    <div class="coverage-label">Functions</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${cov.functions.pct}%"></div>
                    </div>
                    <div class="coverage-value">${cov.functions.pct.toFixed(2)}% (${cov.functions.covered}/${cov.functions.total})</div>
                </div>
                <div class="coverage-item">
                    <div class="coverage-label">Lines</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${cov.lines.pct}%"></div>
                    </div>
                    <div class="coverage-value">${cov.lines.pct.toFixed(2)}% (${cov.lines.covered}/${cov.lines.total})</div>
                </div>
            </div>
        </div>`;
    }

    private buildProjectIssues(project: TestRunResult): string {
        if (project.environmentIssues.length === 0) {
            return '';
        }

        return `
        <div class="issues">
            <h4>Environment Issues</h4>
            ${project.environmentIssues.map(issue => `
            <div class="issue ${issue.severity}">
                <div class="issue-header">
                    <strong>[${issue.code}]</strong> ${issue.message}
                </div>
                ${issue.details ? `<div class="issue-details">${issue.details}</div>` : ''}
                ${issue.remediation && issue.remediation.length > 0 ? `
                <div class="remediation">
                    <strong>Remediation:</strong>
                    ${issue.remediation.map(step => `
                    <div class="remediation-step">
                        <div><strong>${step.title}</strong></div>
                        <div>${step.description}</div>
                        ${step.command ? `<code>${step.command}</code>` : ''}
                    </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>
            `).join('')}
        </div>`;
    }

    private buildProjectActions(project: TestRunResult): string {
        if (project.autoFixActions.length === 0) {
            return '';
        }

        return `
        <div class="actions">
            <h4>Auto-Fix Actions</h4>
            <table class="actions-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Command</th>
                        <th>Status</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    ${project.autoFixActions.map(action => `
                    <tr class="${action.success ? 'success' : 'error'}">
                        <td>${action.description}</td>
                        <td><code>${action.command}</code></td>
                        <td><span class="badge ${action.success ? 'success' : 'error'}">${action.success ? 'Success' : 'Failed'}</span></td>
                        <td>${new Date(action.timestamp).toLocaleTimeString()}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    private buildEnvironmentSection(result: JobResult): string {
        if (result.environmentIssues.length === 0 && result.autoFixActions.length === 0) {
            return '';
        }

        return `
        <section class="environment">
            <h2>🔧 Environment & Auto-Fixes</h2>
            <div class="env-stats">
                <div>Total Issues: ${result.environmentIssues.length}</div>
                <div>Auto-Fixes Attempted: ${result.autoFixActions.length}</div>
                <div>Successful Fixes: ${result.autoFixActions.filter(a => a.success).length}</div>
            </div>
        </section>`;
    }

    private buildFooter(result: JobResult): string {
        return `
        <footer>
            <div>Job ID: <strong>${result.jobId}</strong> | Projects: ${result.summary.totalProjects} | Duration: ${this.formatDuration(result.duration)}</div>
            <div>Report generated at: ${new Date().toLocaleString()}</div>
            <div>Powered by <strong>Autonomous Test Bot</strong> 🤖</div>
        </footer>`;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        return `${(ms / 60000).toFixed(2)}min`;
    }

    private getStyles(): string {
        return `<style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        header h1 { font-size: 2em; margin-bottom: 15px; }
        .header-info { display: flex; gap: 30px; align-items: center; flex-wrap: wrap; }
        .status-badge { padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9em; }
        .status-badge.success { background: #10b981; }
        .status-badge.warning { background: #f59e0b; }
        .status-badge.error { background: #ef4444; }
        .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; flex: 1; }
        section { background: white; padding: 25px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        h2 { margin-bottom: 20px; color: #1f2937; font-size: 1.5em; }
        h3 { color: #374151; }
        h4 { color: #4b5563; margin: 15px 0 10px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; }
        .metric { text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px; }
        .metric-value { font-size: 2em; font-weight: bold; color: #1f2937; }
        .metric-label { color: #6b7280; font-size: 0.9em; margin-top: 5px; }
        .metric.success .metric-value { color: #10b981; }
        .metric.error .metric-value { color: #ef4444; }
        .alert { padding: 15px; border-radius: 8px; margin: 15px 0; }
        .alert.info { background: #dbeafe; border-left: 4px solid #3b82f6; }
        .alert.warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
        .alert.error { background: #fee2e2; border-left: 4px solid #ef4444; }
        .project-card { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 15px; overflow: hidden; }
        .project-header { padding: 20px; background: #f9fafb; cursor: pointer; transition: background 0.2s; }
        .project-header:hover { background: #f3f4f6; }
        .project-title { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .project-stats { display: flex; gap: 20px; margin-top: 10px; color: #6b7280; font-size: 0.9em; }
        .toggle-icon { transition: transform 0.3s; }
        .project-body { padding: 20px; display: none; }
        .project-body.open { display: block; }
        .badge { padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600; }
        .badge.success { background: #d1fae5; color: #065f46; }
        .badge.error { background: #fee2e2; color: #991b1b; }
        .badge.info { background: #dbeafe; color: #1e40af; }
        .language-badge { background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; }
        .framework-badge { background: #fce7f3; color: #9f1239; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th { background: #f9fafb; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
        td { padding: 12px; border-bottom: 1px solid #f3f4f6; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.9em; }
        .coverage-grid { display: grid; gap: 15px; margin: 10px 0; }
        .coverage-item { }
        .coverage-label { font-weight: 600; margin-bottom: 5px; }
        .coverage-bar { height: 20px; background: #e5e7eb; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; background: linear-gradient(90deg, #10b981 0%, #059669 100%); }
        .coverage-value { margin-top: 5px; color: #6b7280; font-size: 0.9em; }
        .issue { padding: 15px; border-radius: 8px; margin: 10px 0; }
        .issue.error { background: #fee2e2; border-left: 4px solid #ef4444; }
        .issue.warning { background: #fef3c7; border-left: 4px solid #f59e0b; }
        .issue.info { background: #dbeafe; border-left: 4px solid #3b82f6; }
        .remediation { margin-top: 10px; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 4px; }
        .remediation-step { margin: 5px 0; }
        
        /* Issues Section Styles */
        .issues-section { background: white; padding: 25px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .issues-summary { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .issue-count { padding: 10px 20px; border-radius: 8px; font-weight: 600; }
        .error-count { background: #fee2e2; color: #991b1b; }
        .warning-count { background: #fef3c7; color: #92400e; }
        .info-count { background: #dbeafe; color: #1e40af; }
        .issues-group { margin-bottom: 25px; }
        .issues-group-title { font-size: 1.2em; margin-bottom: 15px; }
        .issues-group-title.error-title { color: #dc2626; }
        .issues-group-title.warning-title { color: #d97706; }
        .issues-group-title.info-title { color: #2563eb; }
        .issue-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 12px; }
        .issue-card.error { border-left: 4px solid #ef4444; background: #fef2f2; }
        .issue-card.warning { border-left: 4px solid #f59e0b; background: #fffbeb; }
        .issue-card.info { border-left: 4px solid #3b82f6; background: #eff6ff; }
        .issue-header-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
        .issue-severity-icon { font-size: 1.2em; }
        .issue-project-badge { background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; }
        .issue-stage-badge { background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 600; }
        .issue-kind-badge { background: #fce7f3; color: #9f1239; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 600; font-family: 'Courier New', monospace; }
        .issue-message { font-weight: 600; color: #1f2937; margin-bottom: 8px; }
        .issue-details { color: #6b7280; font-size: 0.9em; margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.7); border-radius: 4px; }
        .issue-suggestion { background: #ecfdf5; border-left: 3px solid #10b981; padding: 10px; margin: 10px 0; border-radius: 4px; color: #065f46; }
        .issue-fixes { background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 10px; margin: 10px 0; border-radius: 4px; }
        .fix-action { padding: 8px; margin: 5px 0; border-radius: 4px; font-size: 0.9em; }
        .fix-action.success { background: #d1fae5; color: #065f46; }
        .fix-action.failed { background: #fee2e2; color: #991b1b; }
        .issue-llm { font-size: 0.85em; color: #6b7280; margin-top: 8px; font-style: italic; }
        
        footer { text-align: center; padding: 20px; color: #6b7280; }
        @media (max-width: 768px) {
            .metrics-grid { grid-template-columns: repeat(2, 1fr); }
            .project-stats { flex-direction: column; gap: 5px; }
        }
    </style>`;
    }

    private getScripts(): string {
        return `<script>
        function toggleSection(id) {
            const element = document.getElementById(id);
            const icon = element.previousElementSibling.querySelector('.toggle-icon');
            if (element.classList.contains('open')) {
                element.classList.remove('open');
                icon.style.transform = 'rotate(0deg)';
            } else {
                element.classList.add('open');
                icon.style.transform = 'rotate(180deg)';
            }
        }
        // Auto-expand failed projects
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.project-card').forEach((card, idx) => {
                const status = card.querySelector('.badge.error, .badge.warning');
                if (status) {
                    toggleSection('project-' + idx);
                }
            });
        });
    </script>`;
    }
}

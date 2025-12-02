import { EnvironmentHealer } from '../EnvironmentHealer.js';
import { BotConfig } from '../../config/schema.js';
import { CommandRunner } from '../../executor/CommandRunner.js';
import logger from '../../utils/logger.js';

jest.mock('../../executor/CommandRunner.js');
jest.mock('../../utils/logger.js');

type AutoFixAction = {
    project: string;
    path: string;
    command: string;
    description: string;
    success: boolean;
    timestamp: string;
    stdout?: string;
    stderr?: string;
};

type EnvironmentIssue = {
    project: string;
    stage: string;
    severity: string;
    code: string;
    message: string;
    details?: string;
    autoFixed: boolean;
    remediation?: any[];
    autoFixActions?: AutoFixAction[];
};

class TestHealer extends EnvironmentHealer {
    analyze = jest.fn().mockResolvedValue(undefined);
    heal = jest.fn().mockResolvedValue(undefined);
}

describe('EnvironmentHealer', () => {
    let config: BotConfig;
    let healer: TestHealer;
    let mockExecute: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        config = {
            auto_fix: {
                enabled: true,
                install_dependencies: false,
                update_test_config: false,
                create_virtualenv: false,
            },
        } as unknown as BotConfig;

        healer = new TestHealer(config);

        // @ts-expect-error access protected member
        mockExecute = jest.fn();
        // Replace commandRunner.execute with mock
        // @ts-expect-error access protected member
        healer.commandRunner.execute = mockExecute;
    });

    describe('constructor', () => {
        it('should initialize properties correctly', () => {
            expect(healer).toBeInstanceOf(EnvironmentHealer);
            expect(healer.getIssues()).toEqual([]);
            expect(healer.getActions()).toEqual([]);
            expect(healer['commandRunner']).toBeInstanceOf(CommandRunner);
        });
    });

    describe('getIssues', () => {
        it('should return current issues array', () => {
            // Directly add an issue
            healer['issues'].push({ code: 'TEST', project: 'p', stage: 'S', severity: 'HIGH', message: 'msg', autoFixed: false });
            expect(healer.getIssues()).toHaveLength(1);
            expect(healer.getIssues()[0].code).toBe('TEST');
        });
    });

    describe('getActions', () => {
        it('should return current actions array', () => {
            healer['actions'].push({ project: 'p', path: 'path', command: 'cmd', description: 'desc', success: true, timestamp: new Date().toISOString() });
            expect(healer.getActions()).toHaveLength(1);
        });
    });

    describe('executeCommand', () => {
        const cmd = 'echo test';
        const cwd = '/project/path';
        const description = 'desc';
        const project = 'proj';

        it('should execute command successfully and log info', async () => {
            mockExecute.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });

            const action = await healer['executeCommand'](cmd, cwd, description, project);

            expect(mockExecute).toHaveBeenCalledWith(cmd, cwd, 60000);
            expect(action.success).toBe(true);
            expect(action.command).toBe(cmd);
            expect(action.project).toBe(project);
            expect(action.description).toBe(description);
            expect(action.stdout).toBe('ok');
            expect(action.stderr).toBe('');
            expect(healer.getActions()).toContain(action);
            
            expect(logger.info).toHaveBeenCalledWith(`Auto-fix: ${description}`);
            expect(logger.info).toHaveBeenCalledWith(`Running command: ${cmd}`);
            expect(logger.info).toHaveBeenCalledWith(`Auto-fix succeeded: ${description}`);
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should mark success false and log warning on non-zero exit', async () => {
            mockExecute.mockResolvedValue({ exitCode: 1, stdout: 'out', stderr: 'err' });

            const action = await healer['executeCommand'](cmd, cwd, description, project);

            expect(action.success).toBe(false);
            expect(action.stdout).toBe('out');
            expect(action.stderr).toBe('err');
            expect(logger.warn).toHaveBeenCalledWith(`Auto-fix failed: ${description} (exit code: 1)`);
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should catch error thrown during command execution', async () => {
            const error = new Error('fail!');
            mockExecute.mockRejectedValue(error);

            const action = await healer['executeCommand'](cmd, cwd, description, project);

            expect(action.success).toBe(false);
            expect(action.stderr).toBe(error.message);
            expect(logger.error).toHaveBeenCalledWith(`Auto-fix error: ${description} - ${error.message}`);
            expect(logger.info).toHaveBeenCalledWith(`Auto-fix: ${description}`);
            expect(logger.info).toHaveBeenCalledWith(`Running command: ${cmd}`);
        });

        it('should handle non-Error thrown error', async () => {
            const thrown = 'string error';
            mockExecute.mockRejectedValue(thrown);

            const action = await healer['executeCommand'](cmd, cwd, description, project);

            expect(action.success).toBe(false);
            expect(action.stderr).toBe(thrown);
            expect(logger.error).toHaveBeenCalledWith(`Auto-fix error: ${description} - ${thrown}`);
        });
    });

    describe('addIssue', () => {
        it('should add a new issue with correct properties', () => {
            healer['addIssue']('proj1', 'stage1', 'severity1', 'code1', 'message1', 'details1');

            const issues = healer.getIssues();
            expect(issues).toHaveLength(1);
            const issue = issues[0];
            expect(issue.project).toBe('proj1');
            expect(issue.stage).toBe('stage1');
            expect(issue.severity).toBe('severity1');
            expect(issue.code).toBe('code1');
            expect(issue.message).toBe('message1');
            expect(issue.details).toBe('details1');
            expect(issue.autoFixed).toBe(false);
            expect(issue.remediation).toBeUndefined();
        });

        it('should add issue without details if not provided', () => {
            healer['addIssue']('proj', 'stage', 'severity', 'code', 'msg');

            expect(healer.getIssues()[0].details).toBeUndefined();
        });
    });

    describe('addRemediation', () => {
        it('should add remediation steps to matching issue', () => {
            healer['addIssue']('proj', 'stage', 'severity', 'code', 'msg');
            const steps = [{ description: 'step1' }, { description: 'step2' }];

            healer['addRemediation']('code', steps);

            const issue = healer.getIssues()[0];
            expect(issue.remediation).toEqual(steps);
        });

        it('should do nothing if issue code does not exist', () => {
            healer['addIssue']('proj', 'stage', 'severity', 'codeX', 'msg');
            healer['addRemediation']('no_such_code', [{ description: 'step' }]);

            const issue = healer.getIssues()[0];
            expect(issue.remediation).toBeUndefined();
        });
    });

    describe('markIssueFixed', () => {
        it('should mark issue autoFixed true and set autoFixActions', () => {
            healer['addIssue']('proj', 'stage', 'severity', 'code', 'msg');

            const actions: AutoFixAction[] = [
                {
                    project: 'proj',
                    path: '/path',
                    command: 'cmd',
                    description: 'desc',
                    success: true,
                    timestamp: new Date().toISOString(),
                },
            ];

            healer['markIssueFixed']('code', actions);

            const issue = healer.getIssues()[0];
            expect(issue.autoFixed).toBe(true);
            expect(issue.autoFixActions).toEqual(actions);
        });

        it('should do nothing if issue code does not exist', () => {
            healer['addIssue']('proj', 'stage', 'severity', 'code1', 'msg');
            healer['markIssueFixed']('code2', []);

            const issue = healer.getIssues()[0];
            expect(issue.autoFixed).toBe(false);
            expect(issue.autoFixActions).toBeUndefined();
        });
    });

    describe('isAutoFixEnabled', () => {
        it('should return true if enabled', () => {
            healer['config'].auto_fix.enabled = true;
            expect(healer['isAutoFixEnabled']()).toBe(true);
        });

        it('should return false if disabled', () => {
            healer['config'].auto_fix.enabled = false;
            expect(healer['isAutoFixEnabled']()).toBe(false);
        });
    });

    describe('canInstallDependencies', () => {
        it('should return true only if enabled and install_dependencies true', () => {
            healer['config'].auto_fix.enabled = true;
            healer['config'].auto_fix.install_dependencies = true;
            expect(healer['canInstallDependencies']()).toBe(true);

            healer['config'].auto_fix.install_dependencies = false;
            expect(healer['canInstallDependencies']()).toBe(false);

            healer['config'].auto_fix.enabled = false;
            healer['config'].auto_fix.install_dependencies = true;
            expect(healer['canInstallDependencies']()).toBe(false);
        });
    });

    describe('canUpdateConfig', () => {
        it('should return true only if enabled and update_test_config true', () => {
            healer['config'].auto_fix.enabled = true;
            healer['config'].auto_fix.update_test_config = true;
            expect(healer['canUpdateConfig']()).toBe(true);

            healer['config'].auto_fix.update_test_config = false;
            expect(healer['canUpdateConfig']()).toBe(false);

            healer['config'].auto_fix.enabled = false;
            healer['config'].auto_fix.update_test_config = true;
            expect(healer['canUpdateConfig']()).toBe(false);
        });
    });

    describe('canCreateVirtualenv', () => {
        it('should return true only if enabled and create_virtualenv true', () => {
            healer['config'].auto_fix.enabled = true;
            healer['config'].auto_fix.create_virtualenv = true;
            expect(healer['canCreateVirtualenv']()).toBe(true);

            healer['config'].auto_fix.create_virtualenv = false;
            expect(healer['canCreateVirtualenv']()).toBe(false);

            healer['config'].auto_fix.enabled = false;
            healer['config'].auto_fix.create_virtualenv = true;
            expect(healer['canCreateVirtualenv']()).toBe(false);
        });
    });

    describe('abstract methods', () => {
        it('should have analyze and heal as abstract methods and callable on subclass', async () => {
            await expect(healer.analyze('proj' as any, '/path', [])).resolves.toBeUndefined();
            await expect(healer.heal('/path')).resolves.toBeUndefined();
        });
    });
});
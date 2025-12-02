import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { ensureDir, writeFile } from '../utils/fileUtils.js';
import path from 'path';

export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
}

/**
 * Executes commands and captures output
 */
export class CommandRunner {
    /**
     * Execute a command
     */
    async execute(
        command: string,
        cwd: string,
        timeout: number = 300000
    ): Promise<CommandResult> {
        const startTime = Date.now();

        logger.info(`Executing command: ${command} in ${cwd}`);

        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(' ');
            const child = spawn(cmd, args, {
                cwd,
                shell: true,
                env: { ...process.env, FORCE_COLOR: '0' },
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutId = setTimeout(() => {
                child.kill();
                reject(new Error(`Command timed out after ${timeout}ms`));
            }, timeout);

            child.on('close', (code) => {
                clearTimeout(timeoutId);
                const duration = Date.now() - startTime;

                const result: CommandResult = {
                    exitCode: code || 0,
                    stdout,
                    stderr,
                    duration,
                };

                logger.info(`Command completed with exit code ${code} in ${duration}ms`);
                resolve(result);
            });

            child.on('error', (error) => {
                clearTimeout(timeoutId);
                logger.error(`Command execution error: ${error}`);
                reject(error);
            });
        });
    }

    /**
     * Save command output to files
     */
    async saveOutput(
        outputDir: string,
        result: CommandResult,
        filePrefix: string
    ): Promise<{ stdoutPath: string; stderrPath: string }> {
        await ensureDir(outputDir);

        const stdoutPath = path.join(outputDir, `${filePrefix}-stdout.log`);
        const stderrPath = path.join(outputDir, `${filePrefix}-stderr.log`);

        await writeFile(stdoutPath, result.stdout);
        await writeFile(stderrPath, result.stderr);

        return { stdoutPath, stderrPath };
    }
}

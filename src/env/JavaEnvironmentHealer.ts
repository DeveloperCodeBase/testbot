import { EnvironmentHealer } from './EnvironmentHealer';
import { ProjectDescriptor } from '../models/ProjectDescriptor';
import { fileExists } from '../utils/fileUtils';
import logger from '../utils/logger';
import path from 'path';

/**
 * Healer for Java / Maven environments
 * Mostly validation and reporting, no aggressive auto-fix
 */
export class JavaEnvironmentHealer extends EnvironmentHealer {

    async analyze(
        project: ProjectDescriptor,
        projectPath: string,
        _generatedFiles: string[]
    ): Promise<void> {
        logger.info(`Analyzing Java environment for ${project.name}`);

        // 1. Check pom.xml
        const pomPath = path.join(projectPath, 'pom.xml');
        if (!(await fileExists(pomPath))) {
            this.addIssue(
                project.name,
                'analysis',
                'error',
                'MISSING_POM_XML',
                'pom.xml file not found',
                'Maven projects require a pom.xml file'
            );
            return; // Cannot proceed without pom.xml
        }

        // 2. Check Maven availability
        try {
            const result = await this.commandRunner.execute('mvn -version', projectPath, 5000);
            if (result.exitCode !== 0) {
                this.reportMavenMissing(project.name);
            }
        } catch {
            this.reportMavenMissing(project.name);
        }
    }

    async heal(_projectPath: string): Promise<void> {
        // Java environment is too complex to auto-fix safely
        // We rely on clear remediation instructions provided during analysis
        return;
    }

    private reportMavenMissing(projectName: string): void {
        this.addIssue(
            projectName,
            'env-setup',
            'error',
            'JAVA_ENVIRONMENT_MISSING',
            'Maven (mvn) command not found or failed',
            'Ensure JDK and Maven are installed and in your PATH'
        );
        this.addRemediation('JAVA_ENVIRONMENT_MISSING', [{
            title: 'Install Maven',
            description: 'Install Maven and ensure it is in your system PATH',
            command: 'sudo apt-get install maven' // Assuming Linux/Debian based on user env
        }]);
    }
}

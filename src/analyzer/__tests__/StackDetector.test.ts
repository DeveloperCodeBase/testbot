// @ts-nocheck
import path from 'path';
import { StackDetector } from '../StackDetector';
import * as fileUtils from '../../utils/fileUtils';

jest.mock('../../utils/fileUtils', () => ({
  fileExists: jest.fn(),
  findFiles: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('StackDetector', () => {
  const repoPath = '/repo';
  let stackDetector: StackDetector;

  beforeEach(() => {
    stackDetector = new StackDetector(repoPath);
    jest.clearAllMocks();
  });

  describe('analyze', () => {
    it('detects projects and languages correctly and returns analysis', async () => {
      const nodeProjects = [
        {
          name: 'node_proj',
          language: 'typescript',
          framework: 'nestjs',
          path: 'node_proj',
          buildTool: 'npm',
          testFramework: 'jest',
          entryPoints: ['/repo/node_proj/src/index.ts'],
          packageManager: 'npm',
          dependencies: {},
        },
      ];
      const pythonProjects = [
        {
          name: 'python_proj',
          language: 'python',
          framework: 'django',
          path: 'python_proj',
          buildTool: 'pip',
          testFramework: 'pytest',
          entryPoints: ['/repo/python_proj/manage.py'],
        },
      ];
      const javaProjects = [
        {
          name: 'java_proj',
          language: 'java',
          framework: 'spring-boot',
          path: 'java_proj',
          buildTool: 'maven',
          testFramework: 'junit',
          entryPoints: [],
        },
      ];

      // Mock detect methods
      // We'll spy on private methods by casting to 'any'
      jest.spyOn(stackDetector as any, 'detectNodeProjects').mockResolvedValue(nodeProjects);
      jest.spyOn(stackDetector as any, 'detectPythonProjects').mockResolvedValue(pythonProjects);
      jest.spyOn(stackDetector as any, 'detectJavaProjects').mockResolvedValue(javaProjects);

      const analysis = await stackDetector.analyze();

      expect(analysis.repoPath).toBe(repoPath);
      expect(analysis.projects.length).toBe(3);
      expect(analysis.languages.sort()).toEqual(['java', 'javascript', 'python']);
      expect(analysis.isMonorepo).toBe(true);

      // Ensure logger.info called with expected messages
      const { default: logger } = await import('../../utils/logger');
      expect(logger.info).toHaveBeenCalledWith('Starting stack detection...');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Detected 3 project(s)'));
    });
  });

  describe('detectNodeProjects', () => {
    const findFilesMock = fileUtils.findFiles as jest.Mock;
    const readFileMock = fileUtils.readFile as jest.Mock;
    const fileExistsMock = fileUtils.fileExists as jest.Mock;

    beforeEach(() => {
      findFilesMock.mockReset();
      readFileMock.mockReset();
      fileExistsMock.mockReset();
    });

    it('detects no projects when no package.json found', async () => {
      findFilesMock.mockResolvedValue([]);
      const projects = await (stackDetector as any).detectNodeProjects();
      expect(projects).toEqual([]);
    });

    it('parses package.json and creates project descriptor', async () => {
      const packageJsonPath = path.join(repoPath, 'proj', 'package.json');
      const packageJsonContent = JSON.stringify({
        name: 'testproj',
        main: 'lib/index.js',
        dependencies: { express: '^4.0.0' },
        devDependencies: { jest: '^27.0.0', typescript: '^4.0.0' },
      });
      findFilesMock.mockResolvedValue([packageJsonPath]);
      readFileMock.mockResolvedValue(packageJsonContent);
      fileExistsMock.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('src/index.ts')) return false;
        if (filePath.endsWith('src/index.js')) return false;
        if (filePath.endsWith('index.ts')) return false;
        if (filePath.endsWith('index.js')) return false;
        return false;
      });

      // Mock detectNodePackageManager to return 'npm'
      jest.spyOn(stackDetector as any, 'detectNodePackageManager').mockResolvedValue('npm');

      const projects = await (stackDetector as any).detectNodeProjects();

      expect(projects.length).toBe(1);
      const project = projects[0];
      expect(project.name).toBe('testproj');
      expect(project.language).toBe('typescript'); // Because typescript dep exists
      expect(project.framework).toBe('express');
      expect(project.testFramework).toBe('jest');
      expect(project.buildTool).toBeUndefined();
      expect(project.entryPoints).toContain(path.join(repoPath, 'proj', 'lib/index.js'));
      expect(project.packageManager).toBe('npm');
      expect(project.dependencies).toEqual({ express: '^4.0.0', jest: '^27.0.0', typescript: '^4.0.0' });
    });

    it('logs warning if package.json is malformed', async () => {
      const packageJsonPath = path.join(repoPath, 'bad', 'package.json');
      findFilesMock.mockResolvedValue([packageJsonPath]);
      readFileMock.mockResolvedValue('invalid json');

      const warnSpy = jest.spyOn(logger, 'warn');

      const projects = await (stackDetector as any).detectNodeProjects();

      expect(projects).toEqual([]);
      expect(logSpy).toHaveBeenCalled();
      expect(logSpy.mock.calls[0][0]).toMatch(/Failed to parse package.json/);
    });
  });

  describe('detectPythonProjects', () => {
    const findFilesMock = fileUtils.findFiles as jest.Mock;
    const fileExistsMock = fileUtils.fileExists as jest.Mock;
    const readFileMock = fileUtils.readFile as jest.Mock;

    beforeEach(() => {
      findFilesMock.mockReset();
      fileExistsMock.mockReset();
      readFileMock.mockReset();
    });

    it('returns projects when marker files are found', async () => {
      findFilesMock.mockImplementation(async (repoPath, patterns) => {
        return [
          path.join(repoPath, 'proj1', 'pyproject.toml'),
          path.join(repoPath, 'proj2', 'requirements.txt'),
        ];
      });

      // For each detected project path, mock fileExists for entry points
      fileExistsMock.mockImplementation(async (filePath: string) => {
        if (
          filePath.endsWith('main.py') ||
          filePath.endsWith('app.py') ||
          filePath.endsWith('wsgi.py') ||
          filePath.endsWith('asgi.py') ||
          filePath.endsWith('manage.py')
        )
          return false;
        return false;
      });

      // Mock detectPythonFramework to resolve undefined
      jest.spyOn(stackDetector as any, 'detectPythonFramework').mockResolvedValue(undefined);

      const projects = await (stackDetector as any).detectPythonProjects();

      expect(projects.length).toBe(2);
      expect(projects[0].language).toBe('python');
      expect(projects[1].language).toBe('python');
    });

    it('if no marker files but python files exist, adds root project', async () => {
      findFilesMock.mockResolvedValueOnce([]); // marker files
      findFilesMock.mockResolvedValueOnce([path.join(repoPath, 'file.py')]); // python files

      jest.spyOn(stackDetector as any, 'detectPythonFramework').mockResolvedValue(undefined);
      fileExistsMock.mockResolvedValue(false);

      const projects = await (stackDetector as any).detectPythonProjects();

      expect(projects.length).toBe(1);
      expect(projects[0].path).toBe('.');
      expect(projects[0].language).toBe('python');
    });
  });

  describe('detectJavaProjects', () => {
    const findFilesMock = fileUtils.findFiles as jest.Mock;

    beforeEach(() => {
      findFilesMock.mockReset();
    });

    it('should detect maven and gradle projects', async () => {
      findFilesMock.mockImplementation(async (repoPath, patterns) => {
        if (patterns === '**/pom.xml') {
          return [path.join(repoPath, 'proj1', 'pom.xml')];
        }
        if (patterns === '**/build.gradle*') {
          return [path.join(repoPath, 'proj2', 'build.gradle')];
        }
        return [];
      });

      const projects = await (stackDetector as any).detectJavaProjects();

      expect(projects.length).toBe(2);

      const mavenProject = projects.find(p => p.buildTool === 'maven');
      const gradleProject = projects.find(p => p.buildTool === 'gradle');

      expect(mavenProject).toBeDefined();
      expect(mavenProject?.language).toBe('java');
      expect(mavenProject?.framework).toBe('spring-boot');

      expect(gradleProject).toBeDefined();
      expect(gradleProject?.language).toBe('java');
      expect(gradleProject?.framework).toBe('spring-boot');
    });

    it('skips gradle project if path already detected by maven', async () => {
      const samePath = path.join(repoPath, 'proj');

      findFilesMock.mockImplementation(async (repoPath, patterns) => {
        if (patterns === '**/pom.xml') {
          return [samePath + '/pom.xml'];
        }
        if (patterns === '**/build.gradle*') {
          return [samePath + '/build.gradle'];
        }
        return [];
      });

      const projects = await (stackDetector as any).detectJavaProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].buildTool).toBe('maven');
    });
  });

  describe('detectNodeFramework', () => {
    it('detects known frameworks', () => {
      const adapter = stackDetector as any;

      expect(adapter.detectNodeFramework({ dependencies: { '@nestjs/core': '1' }, devDependencies: {} })).toBe('nestjs');
      expect(adapter.detectNodeFramework({ dependencies: { next: '1' }, devDependencies: {} })).toBe('nextjs');
      expect(adapter.detectNodeFramework({ dependencies: { express: '1' }, devDependencies: {} })).toBe('express');
      expect(adapter.detectNodeFramework({ dependencies: { react: '1' }, devDependencies: {} })).toBe('react');
      expect(adapter.detectNodeFramework({ dependencies: { vue: '1' }, devDependencies: {} })).toBe('vue');
      expect(adapter.detectNodeFramework({ dependencies: { '@angular/core': '1' }, devDependencies: {} })).toBe('angular');
      expect(adapter.detectNodeFramework({ dependencies: {}, devDependencies: {} })).toBeUndefined();
    });
  });

  describe('detectNodeTestFramework', () => {
    const adapter = stackDetector as any;
    it('detects known test frameworks', () => {
      expect(adapter.detectNodeTestFramework({ dependencies: { jest: '1' }, devDependencies: {} })).toBe('jest');
      expect(adapter.detectNodeTestFramework({ dependencies: {}, devDependencies: { mocha: '1' } })).toBe('mocha');
      expect(adapter.detectNodeTestFramework({ dependencies: {}, devDependencies: { vitest: '1' } })).toBe('vitest');
    });

    it('defaults to jest if none detected', () => {
      expect(adapter.detectNodeTestFramework({ dependencies: {}, devDependencies: {} })).toBe('jest');
    });
  });

  describe('detectNodePackageManager', () => {
    const fileExistsMock = fileUtils.fileExists as jest.Mock;
    beforeEach(() => {
      fileExistsMock.mockReset();
    });

    it('returns pnpm if pnpm-lock.yaml exists', async () => {
      fileExistsMock.mockImplementation(async (p) => p.endsWith('pnpm-lock.yaml'));
      const pm = await (stackDetector as any).detectNodePackageManager('/');
      expect(pm).toBe('pnpm');
    });

    it('returns yarn if yarn.lock exists', async () => {
      fileExistsMock.mockImplementation(async (p) => p.endsWith('yarn.lock'));
      const pm = await (stackDetector as any).detectNodePackageManager('/');
      expect(pm).toBe('yarn');
    });

    it('defaults to npm otherwise', async () => {
      fileExistsMock.mockResolvedValue(false);
      const pm = await (stackDetector as any).detectNodePackageManager('/');
      expect(pm).toBe('npm');
    });
  });

  describe('detectPythonFramework', () => {
    const fileExistsMock = fileUtils.fileExists as jest.Mock;
    const readFileMock = fileUtils.readFile as jest.Mock;
    beforeEach(() => {
      fileExistsMock.mockReset();
      readFileMock.mockReset();
    });

    it('returns django if manage.py exists', async () => {
      fileExistsMock.mockImplementation(async p => p.endsWith('manage.py'));
      const framework = await (stackDetector as any).detectPythonFramework('/proj');
      expect(framework).toBe('django');
    });

    it('detects flask, fastapi, django from requirements.txt content', async () => {
      fileExistsMock.mockImplementation(async p => p.endsWith('requirements.txt'));
      readFileMock.mockResolvedValue('flask\nsome-other-package');
      expect(await (stackDetector as any).detectPythonFramework('/proj')).toBe('flask');

      readFileMock.mockResolvedValue('fastapi\notherpackage');
      expect(await (stackDetector as any).detectPythonFramework('/proj')).toBe('fastapi');

      readFileMock.mockResolvedValue('django\nsomething');
      expect(await (stackDetector as any).detectPythonFramework('/proj')).toBe('django');
    });

    it('returns undefined if no known frameworks', async () => {
      fileExistsMock.mockResolvedValue(false);
      readFileMock.mockResolvedValue('');
      const framework = await (stackDetector as any).detectPythonFramework('/proj');
      expect(framework).toBeUndefined();
    });
  });
});
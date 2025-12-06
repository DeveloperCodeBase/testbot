import fs from 'fs';
import os from 'os';
import path from 'path';
import { EnvLoader } from '../EnvLoader';

const ORIGINAL_ENV = { ...process.env };

describe('EnvLoader', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-'));

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('loads variables from a target repository .env', () => {
        const repoDir = path.join(tmpRoot, 'repo');
        fs.mkdirSync(repoDir, { recursive: true });
        const envPath = path.join(repoDir, '.env');
        fs.writeFileSync(envPath, 'LOADER_TEST_TOKEN=from_repo');

        const loader = new EnvLoader();
        const result = loader.load(repoDir);

        expect(process.env.LOADER_TEST_TOKEN).toBe('from_repo');
        expect(result.loadedFrom).toContain(envPath);
        expect(result.tried).toContain(envPath);
    });

    it('attempts global fallback locations when repo env missing', () => {
        const loader = new EnvLoader();
        const result = loader.load(path.join(tmpRoot, 'non-existent'));

        expect(result.tried.some(p => p.endsWith('.env'))).toBe(true);
        expect(Array.isArray(result.loadedFrom)).toBe(true);
    });
});

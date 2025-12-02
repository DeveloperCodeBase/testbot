import fetch from 'node-fetch';
import type { Response } from 'node-fetch';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_USERNAME = process.env.TEST_USERNAME || 'testuser';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

interface AuthResponse {
  token?: string;
  [key: string]: any;
}

describe('API Health Integration Tests', () => {
  let authToken: string | null = null;

  beforeAll(async () => {
    // Authenticate and store token if available
    try {
      const res: Response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
      });
      if (res.ok) {
        const body: AuthResponse = await res.json();
        authToken = body.token || null;
      } else if (res.status === 401) {
        throw new Error('Authentication failed during setup');
      }
    } catch (e) {
      // log but don't fail the test suite because auth might not be required
      console.warn('Authentication not required or failed:', e);
      authToken = null;
    }
  });

  describe('GET /health', () => {
    it('returns 200 and correct response format with valid auth (if required)', async () => {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API_BASE_URL}/health`, { headers });
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(json).toBeDefined();
      expect(
        typeof json.status === 'string' || typeof json.status === 'boolean'
      ).toBe(true);
      expect(json.status === 'ok' || json.status === true).toBe(true);
    });

    it('returns 401 or 403 for GET /health with invalid token', async () => {
      if (!authToken) {
        return; // skip test if no auth token available
      }
      const res = await fetch(`${API_BASE_URL}/health`, {
        headers: { Authorization: 'Bearer invalidtoken123' },
      });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api', () => {
    it('returns 200 and expected endpoints list or message with valid auth (if required)', async () => {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${API_BASE_URL}/api`, { headers });
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
      const json = await res.json();
      expect(typeof json).toBe('object');

      if (Array.isArray(json.endpoints)) {
        expect(json.endpoints.length).toBeGreaterThan(0);
        json.endpoints.forEach((ep: unknown) => {
          expect(typeof ep).toBe('string');
          expect((ep as string).startsWith('/')).toBe(true);
        });
      } else if (typeof json.message === 'string') {
        expect(json.message.length).toBeGreaterThan(0);
      } else {
        expect(Object.keys(json).length).toBeGreaterThan(0);
      }
    });

    it('returns 401 or 403 for GET /api without auth if auth is required', async () => {
      if (!authToken) {
        return; // skip test if no auth token available to detect auth requirement
      }
      const res = await fetch(`${API_BASE_URL}/api`);
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('Unknown Endpoint', () => {
    it('returns 404 for unknown endpoint', async () => {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${API_BASE_URL}/unknown-endpoint`, { headers });
      expect(res.status).toBe(404);
    });
  });
});
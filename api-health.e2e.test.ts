import { test, expect, request, APIRequestContext } from '@playwright/test';

describe('API Health End-to-End Tests (Jest style)', () => {
  let apiContext: APIRequestContext;
  let authToken: string | null = null;
  const baseURL = process.env.API_BASE_URL || 'http://localhost:3000';
  const testUsername = process.env.TEST_USERNAME || 'testuser';
  const testPassword = process.env.TEST_PASSWORD || 'password123';

  beforeAll(async () => {
    apiContext = await request.newContext({ baseURL });

    try {
      const authResponse = await apiContext.post('/auth/login', {
        data: {
          username: testUsername,
          password: testPassword,
        },
      });

      if (authResponse.ok()) {
        const authBody = await authResponse.json();
        authToken = authBody.token || null;
      } else if (authResponse.status() === 401) {
        throw new Error('Authentication failed during setup');
      }
    } catch (e) {
      console.warn('Authentication not required or failed:', e);
      authToken = null;
    }
  }, 30000);

  afterAll(async () => {
    await apiContext.dispose();
  });

  describe('GET /health endpoint', () => {
    it('should return 200 and correct response format', async () => {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const response = await apiContext.get('/health', { headers });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const json = await response.json();
      expect(json).toBeDefined();
      expect(typeof json.status === 'string' || typeof json.status === 'boolean').toBeTruthy();
      expect(json.status === 'ok' || json.status === true).toBeTruthy();
    });

    it('should return 401 or 403 with invalid auth token if auth token present', async () => {
      if (!authToken) {
        return;
      }
      const invalidToken = 'invalidtoken123';
      const response = await apiContext.get('/health', {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });

      expect([401, 403]).toContain(response.status());
    });
  });

  describe('GET /api endpoint', () => {
    it('should return 200 and expected endpoints list or message', async () => {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const response = await apiContext.get('/api', { headers });

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const json = await response.json();
      expect(json).toBeInstanceOf(Object);

      if (Array.isArray(json.endpoints)) {
        expect(json.endpoints.length).toBeGreaterThan(0);
        for (const ep of json.endpoints) {
          expect(typeof ep).toBe('string');
          expect(ep.startsWith('/')).toBeTruthy();
        }
      } else if (typeof json.message === 'string') {
        expect(json.message.length).toBeGreaterThan(0);
      } else {
        expect(Object.keys(json).length).toBeGreaterThan(0);
      }
    });

    it('should return 401 or 403 with missing auth if authToken was set', async () => {
      if (!authToken) {
        return;
      }

      const response = await apiContext.get('/api');

      expect([401, 403]).toContain(response.status());
    });
  });

  describe('GET /unknown-endpoint', () => {
    it('should return 404', async () => {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const response = await apiContext.get('/unknown-endpoint', { headers });

      expect(response.status()).toBe(404);
    });
  });
});
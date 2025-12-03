// @ts-nocheck
import { request, APIRequestContext, APIResponse } from '@playwright/test';

jest.setTimeout(30000);

describe('API Health E2E Tests', () => {
  let apiContext: APIRequestContext;
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const username = process.env.TEST_USER || '';
  const password = process.env.TEST_PASSWORD || '';
  let authToken: string | null = null;

  beforeAll(async () => {
    apiContext = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        accept: 'application/json',
      },
    });

    if (username && password) {
      const response = await apiContext.post('/login', {
        data: { username, password },
      });
      expect(response.ok()).toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('token');
      authToken = body.token;

      await apiContext.dispose();

      apiContext = await request.newContext({
        baseURL,
        extraHTTPHeaders: {
          accept: 'application/json',
          authorization: `Bearer ${authToken}`,
        },
      });
    }
  });

  afterAll(async () => {
    await apiContext.dispose();
  });

  describe('GET /health endpoint', () => {
    it('should respond with 200 and a healthy status with correct schema', async () => {
      const response = await apiContext.get('/health');
      expect(response.ok()).toBe(true);
      expect(response.status()).toBe(200);

      const json = await response.json();

      expect(json).toHaveProperty('status');
      expect(typeof json.status).toBe('string');
      expect(['healthy', 'ok', 'up']).toContain(json.status.toLowerCase());

      if ('uptime' in json) {
        expect(typeof json.uptime).toBe('number');
        expect(json.uptime).toBeGreaterThanOrEqual(0);
      }

      if ('version' in json) {
        expect(typeof json.version).toBe('string');
        expect(json.version.length).toBeGreaterThan(0);
      }

      if ('dbStatus' in json) {
        expect(typeof json.dbStatus).toBe('string');
        expect(['connected', 'disconnected', 'connecting', 'failed']).toContain(json.dbStatus.toLowerCase());
      }
    });
  });

  describe('GET /api endpoint', () => {
    it('should respond with 200 and a list or description of available endpoints', async () => {
      const response = await apiContext.get('/api');
      expect(response.ok()).toBe(true);
      expect(response.status()).toBe(200);

      const json = await response.json();

      expect(json).toBeDefined();
      expect(['object', 'array']).toContain(typeof json);

      if (json && typeof json === 'object' && !Array.isArray(json)) {
        if ('endpoints' in json) {
          expect(Array.isArray(json.endpoints)).toBe(true);
          expect(json.endpoints.length).toBeGreaterThan(0);
          for (const ep of json.endpoints) {
            expect(typeof ep).toBe('string');
            expect(ep.startsWith('/')).toBe(true);
          }
        }
      }
    });
  });

  describe('Error Scenarios', () => {
    it('should gracefully handle error scenario on /health when auth token invalid', async () => {
      if (authToken) {
        const badContext = await request.newContext({
          baseURL,
          extraHTTPHeaders: {
            authorization: 'Bearer invalidtoken123',
            accept: 'application/json',
          },
        });

        const resp = await badContext.get('/health');
        expect([401, 403, 500]).toContain(resp.status());

        await badContext.dispose();
      } else {
        const resp = await apiContext.get('/health-invalid');
        expect(resp.status()).toBe(404);
      }
    });
  });

  describe('Authentication Tests', () => {
    it('should enforce authentication on /health and /api endpoints if auth required', async () => {
      if (authToken) {
        const noAuthContext = await request.newContext({
          baseURL,
          extraHTTPHeaders: {
            accept: 'application/json',
          },
        });

        const healthResp = await noAuthContext.get('/health');
        expect([401, 403]).toContain(healthResp.status());

        const apiResp = await noAuthContext.get('/api');
        expect([401, 403]).toContain(apiResp.status());

        await noAuthContext.dispose();
      } else {
        // No auth required - endpoints should be accessible
        const healthResp = await apiContext.get('/health');
        expect(healthResp.ok()).toBeTruthy();

        const apiResp = await apiContext.get('/api');
        expect(apiResp.ok()).toBeTruthy();
      }
    });
  });
});
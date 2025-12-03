// @ts-nocheck
import { test, expect, request, APIRequestContext } from '@playwright/test';

test.describe('API Health E2E Tests', () => {
  let apiContext: APIRequestContext;
  // Assuming environment variables or config for user credentials
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  const username = process.env.TEST_USER || '';
  const password = process.env.TEST_PASSWORD || '';
  let authToken: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        accept: 'application/json',
      },
    });

    // If authentication required - simulate login and get token
    // Skipping this if no auth required or if auth credentials are not provided
    if (username && password) {
      const response = await apiContext.post('/login', {
        data: { username, password },
      });
      expect(response.ok(), 'login should succeed').toBeTruthy();

      const body = await response.json();
      expect(body).toHaveProperty('token');
      authToken = body.token;

      // Recreate context with authorization header for subsequent calls
      apiContext.dispose();
      apiContext = await request.newContext({
        baseURL,
        extraHTTPHeaders: {
          accept: 'application/json',
          authorization: `Bearer ${authToken}`,
        },
      });
    }
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('Health endpoint /health responds with status 200, healthy status and correct schema', async () => {
    const response = await apiContext.get('/health');
    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const json = await response.json();

    // Check response keys and values (adjust according to expected response)
    expect(json).toHaveProperty('status');
    expect(['healthy', 'ok', 'up']).toContain(json.status.toLowerCase());

    // Additional fields like uptime, version, db status could be checked
    if ('uptime' in json) {
      expect(typeof json.uptime).toBe('number');
      expect(json.uptime).toBeGreaterThanOrEqual(0);
    }
  });

  test('API root endpoint /api responds with list of available endpoints or description', async () => {
    const response = await apiContext.get('/api');
    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);

    const json = await response.json();

    // Expect some structure like endpoints array or object
    expect(json).toBeDefined();
    // Basic structural check: must be object or array
    expect(typeof json === 'object').toBe(true);

    // Example: if endpoints listed
    if (Array.isArray(json.endpoints)) {
      expect(json.endpoints.length).toBeGreaterThan(0);
      for (const ep of json.endpoints) {
        expect(typeof ep).toBe('string');
        expect(ep.startsWith('/')).toBe(true);
      }
    }
  });

  test('Error scenario: /health returns 500 or invalid response handled gracefully', async () => {
    // This requires a way to simulate API failure
    // Here we test what happens if endpoint returns error - we expect proper http status codes

    // We will simulate this by requesting a bogus endpoint or with invalid auth

    if (authToken) {
      // If auth required, make request with invalid token
      const badContext = await request.newContext({
        baseURL,
        extraHTTPHeaders: {
          authorization: 'Bearer invalidtoken123',
          accept: 'application/json',
        },
      });
      const resp = await badContext.get('/health');
      // Likely unauthorized or forbidden
      expect([401, 403, 500]).toContain(resp.status());
      await badContext.dispose();
    } else {
      // Make request to a wrong endpoint expecting 404
      const resp = await apiContext.get('/health-invalid');
      expect(resp.status()).toBe(404);
    }
  });

  test('Health and /api endpoints respect authentication requirements', async () => {
    if (authToken) {
      // Without Authorization header - expect 401/403
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
      // If no auth required, these endpoints should be accessible without token
      const healthResp = await apiContext.get('/health');
      expect(healthResp.ok()).toBeTruthy();

      const apiResp = await apiContext.get('/api');
      expect(apiResp.ok()).toBeTruthy();
    }
  });
});
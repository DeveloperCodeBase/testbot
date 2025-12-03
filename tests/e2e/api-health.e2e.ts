// @ts-nocheck
import { test, expect, request, APIResponse } from '@playwright/test';

test.describe('API Health Check End-to-End', () => {
  let apiContext: ReturnType<typeof request.newContext>;

  test.beforeAll(async ({ playwright }) => {
    // Create a new APIRequest context for the whole suite
    apiContext = await playwright.request.newContext({
      baseURL: 'http://localhost:3000', // Adjust base URL as needed
      // Optionally set headers or auth here if required
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });


  test('should verify /health endpoint is accessible and returns success response', async () => {
    const response = await apiContext.get('/health');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Expect common health check props (adjust depending on actual API)
    expect(body).toHaveProperty('status');
    expect(body.status).toMatch(/^(ok|healthy|success)$/i);

    if ('uptime' in body) {
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThan(0);
    }
  });

  test('should verify /api endpoint is accessible and returns expected structure', async () => {
    const response = await apiContext.get('/api');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    // The /api endpoint might return an object describing available endpoints or metadata
    const body = await response.json();
    expect(body).toBeInstanceOf(Object);
    // For example, expect endpoints key or version, adjust as per real API
    expect(body).toMatchObject(expect.objectContaining({
      endpoints: expect.any(Array),
    }));
  });

  test('should handle 404 for invalid endpoint', async () => {
    const response = await apiContext.get('/invalid-endpoint-xyz');
    expect(response.status()).toBe(404);

    const body = await response.json().catch(() => null);
    if (body) {
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    }
  });

  test('should simulate unauthorized access if authentication is required', async () => {
    // If API requires authentication for /health or /api, test unauth behavior
    // Let's test with no auth headers and expect 401/403 if enforced

    // Assuming /api is protected
    const unauthResponse = await apiContext.get('/api');
    if ([401, 403].includes(unauthResponse.status())) {
      expect(unauthResponse.ok()).toBeFalsy();
      const body = await unauthResponse.json();
      expect(body).toHaveProperty('error');
    } else {
      // If API is open, test passes anyway
      expect(unauthResponse.status()).toBe(200);
    }
  });

  test('should verify complete user flow with optional auth, health, and api endpoints', async () => {
    // 1. Authentication step - if needed
    // Let's assume no authentication needed or token via login endpoint
    // For demonstration, if needed:

    /*
    const loginRes = await apiContext.post('/login', { data: { username: 'test', password: 'test' } });
    expect(loginRes.ok()).toBeTruthy();
    const loginBody = await loginRes.json();
    const token = loginBody.token;
    expect(typeof token).toBe('string');

    // Create new context with auth header
    const authContext = await request.newContext({
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    */

    // Since no auth required for health check per context, just chain requests
    const healthRes = await apiContext.get('/health');
    expect(healthRes.ok()).toBeTruthy();
    const healthBody = await healthRes.json();
    expect(healthBody).toHaveProperty('status');

    const apiRes = await apiContext.get('/api');
    expect(apiRes.ok()).toBeTruthy();
    const apiBody = await apiRes.json();
    expect(apiBody).toHaveProperty('endpoints');

    // Confirm endpoints include /health and /api
    expect(apiBody.endpoints).toEqual(expect.arrayContaining(['/health', '/api']));
  });
});
import { test, expect, request, APIRequestContext } from '@playwright/test';

test.describe('API Gateway Health Check End-to-End Tests', () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await request.newContext({
      baseURL: 'http://localhost:3000',
      // Add auth headers here if user authentication is required
      // For example, if JWT token is needed:
      // extraHTTPHeaders: {
      //   Authorization: `Bearer ${token}`,
      // },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('Health endpoint should respond with status 200 and healthy status JSON', async () => {
    const response = await apiContext.get('/health');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Assuming the health endpoint returns { status: 'ok' } or similar
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });

  test('API base endpoint /api should respond with expected data or metadata', async () => {
    // The /api endpoint could respond with available endpoints or API info
    const response = await apiContext.get('/api');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');

    const body = await response.json();
    // Depending on implementation, validate known fields
    // For example, an endpoints list or API version info
    expect(body).toMatchObject({
      version: expect.any(String),
      endpoints: expect.any(Array),
    });
  });

  test('Health check should not require authentication if auth exists', async () => {
    // Try accessing /health without auth headers
    const unauthContext = await request.newContext({
      baseURL: 'http://localhost:3000',
    });
    const response = await unauthContext.get('/health');
    expect(response.status()).toBe(200);
    await unauthContext.dispose();
  });

  test('Check error scenario: Requesting unknown endpoint returns 404', async () => {
    const response = await apiContext.get('/api/unknown-endpoint');
    expect(response.status()).toBe(404);
    const body = await response.json().catch(() => null);
    if (body) {
      // Expect standardized error response structure
      expect(body).toHaveProperty('error');
      expect(body.error).toMatch(/not found/i);
    }
  });

  test('Check error scenario: Invalid method on /health endpoint returns 405 or 404', async () => {
    // Sending POST to /health which is presumably GET only
    const response = await apiContext.post('/health');
    expect([404, 405]).toContain(response.status());
  });
});
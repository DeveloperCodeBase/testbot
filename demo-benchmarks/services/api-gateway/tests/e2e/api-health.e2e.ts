// @ts-nocheck
import { test, expect } from '@playwright/test';
import { API_URL } from '../config'; // Assume API_URL is defined in a config file

test.describe('API Health Check E2E Tests', () => {
  test.beforeEach(async ({ request }) => {
    // Setup code can be added here if needed, e.g., setup test database state
  });

  test.afterEach(async ({ request }) => {
    // Teardown code can be added here if needed, e.g., clean up test database state
  });

  test('should return a successful health check response', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.status()).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toHaveProperty('status', 'healthy');
  });

  test('should return a successful response from /api endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api`);
    expect(response.status()).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toHaveProperty('message', 'API Gateway is up and running');
  });

  test('should handle invalid endpoint gracefully', async ({ request }) => {
    const response = await request.get(`${API_URL}/invalid-endpoint`);
    expect(response.status()).toBe(404);
    const responseBody = await response.json();
    expect(responseBody).toHaveProperty('error', 'Not Found');
  });

  test('should handle server error gracefully', async ({ request, server }) => {
    // Mock a server error by stopping the server temporarily (this is for demonstration purposes)
    server.close();

    const response = await request.get(`${API_URL}/health`);
    expect(response.status()).toBe(502); // Bad Gateway as the server is unreachable

    // Restart the server for subsequent tests
    await server.listen({ port: process.env.PORT || 3000 });
  });
});
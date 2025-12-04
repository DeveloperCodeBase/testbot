"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
test_1.test.describe('API Gateway Health Check End-to-End Tests', () => {
    let apiContext;
    test_1.test.beforeAll(async ({ playwright }) => {
        apiContext = await test_1.request.newContext({
            baseURL: 'http://localhost:3000',
            // Add auth headers here if user authentication is required
            // For example, if JWT token is needed:
            // extraHTTPHeaders: {
            //   Authorization: `Bearer ${token}`,
            // },
        });
    });
    test_1.test.afterAll(async () => {
        await apiContext.dispose();
    });
    (0, test_1.test)('Health endpoint should respond with status 200 and healthy status JSON', async () => {
        const response = await apiContext.get('/health');
        (0, test_1.expect)(response.ok()).toBeTruthy();
        (0, test_1.expect)(response.status()).toBe(200);
        const body = await response.json();
        // Assuming the health endpoint returns { status: 'ok' } or similar
        (0, test_1.expect)(body).toHaveProperty('status');
        (0, test_1.expect)(body.status).toBe('ok');
    });
    (0, test_1.test)('API base endpoint /api should respond with expected data or metadata', async () => {
        // The /api endpoint could respond with available endpoints or API info
        const response = await apiContext.get('/api');
        (0, test_1.expect)(response.ok()).toBeTruthy();
        (0, test_1.expect)(response.status()).toBe(200);
        const contentType = response.headers()['content-type'] || '';
        (0, test_1.expect)(contentType).toContain('application/json');
        const body = await response.json();
        // Depending on implementation, validate known fields
        // For example, an endpoints list or API version info
        (0, test_1.expect)(body).toMatchObject({
            version: test_1.expect.any(String),
            endpoints: test_1.expect.any(Array),
        });
    });
    (0, test_1.test)('Health check should not require authentication if auth exists', async () => {
        // Try accessing /health without auth headers
        const unauthContext = await test_1.request.newContext({
            baseURL: 'http://localhost:3000',
        });
        const response = await unauthContext.get('/health');
        (0, test_1.expect)(response.status()).toBe(200);
        await unauthContext.dispose();
    });
    (0, test_1.test)('Check error scenario: Requesting unknown endpoint returns 404', async () => {
        const response = await apiContext.get('/api/unknown-endpoint');
        (0, test_1.expect)(response.status()).toBe(404);
        const body = await response.json().catch(() => null);
        if (body) {
            // Expect standardized error response structure
            (0, test_1.expect)(body).toHaveProperty('error');
            (0, test_1.expect)(body.error).toMatch(/not found/i);
        }
    });
    (0, test_1.test)('Check error scenario: Invalid method on /health endpoint returns 405 or 404', async () => {
        // Sending POST to /health which is presumably GET only
        const response = await apiContext.post('/health');
        (0, test_1.expect)([404, 405]).toContain(response.status());
    });
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const test_1 = require("@playwright/test");
const config_1 = require("../config"); // Assume API_URL is defined in a config file
test_1.test.describe('API Health Check E2E Tests', () => {
    test_1.test.beforeEach(async ({ request }) => {
        // Setup code can be added here if needed, e.g., setup test database state
    });
    test_1.test.afterEach(async ({ request }) => {
        // Teardown code can be added here if needed, e.g., clean up test database state
    });
    (0, test_1.test)('should return a successful health check response', async ({ request }) => {
        const response = await request.get(`${config_1.API_URL}/health`);
        (0, test_1.expect)(response.status()).toBe(200);
        const responseBody = await response.json();
        (0, test_1.expect)(responseBody).toHaveProperty('status', 'healthy');
    });
    (0, test_1.test)('should return a successful response from /api endpoint', async ({ request }) => {
        const response = await request.get(`${config_1.API_URL}/api`);
        (0, test_1.expect)(response.status()).toBe(200);
        const responseBody = await response.json();
        (0, test_1.expect)(responseBody).toHaveProperty('message', 'API Gateway is up and running');
    });
    (0, test_1.test)('should handle invalid endpoint gracefully', async ({ request }) => {
        const response = await request.get(`${config_1.API_URL}/invalid-endpoint`);
        (0, test_1.expect)(response.status()).toBe(404);
        const responseBody = await response.json();
        (0, test_1.expect)(responseBody).toHaveProperty('error', 'Not Found');
    });
    (0, test_1.test)('should handle server error gracefully', async ({ request, server }) => {
        // Mock a server error by stopping the server temporarily (this is for demonstration purposes)
        server.close();
        const response = await request.get(`${config_1.API_URL}/health`);
        (0, test_1.expect)(response.status()).toBe(502); // Bad Gateway as the server is unreachable
        // Restart the server for subsequent tests
        await server.listen({ port: process.env.PORT || 3000 });
    });
});

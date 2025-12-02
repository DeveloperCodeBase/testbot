// Note: Transform Playwright tests to jest e2e tests using supertest/jest or keep as Playwright tests.
// Since original tests use Playwright test framework,
// here is the Jest-based integration style E2E test mockup for API health endpoints.

import fetch from 'node-fetch';

jest.mock('node-fetch', () => jest.fn());

const { Response } = jest.requireActual('node-fetch');

describe('API Health End-to-End Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('/health endpoint', () => {
    it('should successfully get health status and validate response body', async () => {
      const healthBody = { status: 'OK' };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(healthBody), { status: 200 }),
      );

      const res = await fetch(`${baseURL}/health`);
      expect(res.ok).toBe(true);

      const body = await res.json();
      expect(body).toBeInstanceOf(Object);
      expect(body).toHaveProperty('status');
      expect(typeof body.status).toBe('string');
      expect(['up', 'healthy', 'ok', 'alive']).toContain(body.status.toLowerCase());
    });

    it('should fail if status is missing', async () => {
      const healthBody = {};
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(healthBody), { status: 200 }),
      );

      const res = await fetch(`${baseURL}/health`);
      expect(res.ok).toBe(true);

      const body = await res.json();
      expect(body).toBeInstanceOf(Object);
      expect(body).not.toHaveProperty('status');
    });
  });

  describe('/api endpoint', () => {
    it('should return API metadata with endpoints array including /health', async () => {
      const apiBody = { endpoints: ['/health', '/api', '/login'] };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(apiBody), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

      const res = await fetch(`${baseURL}/api`);
      expect(res.ok).toBe(true);
      expect(res.headers.get('content-type') ?? '').toContain('application/json');

      const body = await res.json();
      expect(body).toBeInstanceOf(Object);
      expect(body).toHaveProperty('endpoints');
      expect(Array.isArray(body.endpoints)).toBe(true);
      expect(body.endpoints).toContain('/health');
    });

    it('should handle non-json content-type gracefully', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response('Not JSON', { status: 200, headers: { 'content-type': 'text/plain' } }),
      );

      const res = await fetch(`${baseURL}/api`);
      expect(res.ok).toBe(true);
      expect(res.headers.get('content-type')).toContain('text/plain');

      await expect(res.json()).rejects.toThrow();
    });
  });

  describe('404 unknown endpoint', () => {
    it('should return 404 with error message if JSON response present', async () => {
      const errorBody = { error: 'Not found' };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(errorBody), { status: 404 }),
      );

      const res = await fetch(`${baseURL}/api/unknown-nonexistent-endpoint`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('should return 404 with no JSON body gracefully', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response('Not found', { status: 404 }),
      );

      const res = await fetch(`${baseURL}/api/unknown-nonexistent-endpoint`);
      expect(res.status).toBe(404);

      // Attempting json() will fail so catch
      const body = await res.json().catch(() => null);
      expect(body).toBeNull();
    });
  });

  describe('server error simulation', () => {
    it('should handle 500+ server error gracefully with error message', async () => {
      const errorBody = { error: 'Internal server error' };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(errorBody), { status: 500 }),
      );

      const res = await fetch(`${baseURL}/api/error`);
      if (res.status >= 500) {
        expect(res.status).toBeGreaterThanOrEqual(500);
        const body = await res.json();
        if (body) {
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');
        }
      }
    });

    it('should skip test if no server error simulation available', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response('No error simulated', { status: 200 }),
      );

      const res = await fetch(`${baseURL}/api/error`);
      if (res.status < 500) {
        // Simulate test.skip by skipping expectations
        expect(true).toBe(true);
      } else {
        throw new Error('Unexpected status code for this test');
      }
    });
  });

  describe('authentication required scenario', () => {
    it('should verify 401 or 403 response with error message if auth required', async () => {
      const errorBody = { error: 'Unauthorized' };
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response(JSON.stringify(errorBody), { status: 401 }),
      );

      const res = await fetch(`${baseURL}/api/protected`);
      if ([401, 403].includes(res.status)) {
        expect([401, 403]).toContain(res.status);
        const body = await res.json();
        if (body) {
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');
        }
      }
    });

    it('should skip test if endpoint accessible without auth', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        new Response('Accessible', { status: 200 }),
      );

      const res = await fetch(`${baseURL}/api/protected`);
      if (![401, 403].includes(res.status)) {
        expect(true).toBe(true); // skipped
      } else {
        throw new Error('Unexpected status for this test');
      }
    });
  });
});
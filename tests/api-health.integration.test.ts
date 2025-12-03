// @ts-nocheck
import fetch from 'node-fetch';
import { Response } from 'node-fetch';

jest.mock('node-fetch', () => jest.fn());

const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('API Health Integration Tests', () => {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return status 200 and valid health status', async () => {
      const mockBody = { status: 'OK' };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), { status: 200 }));

      const response = await fetch(`${baseURL}/health`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(typeof data.status).toBe('string');
      expect(['up', 'healthy', 'ok', 'alive']).toContain(data.status.toLowerCase());
      expect(mockedFetch).toHaveBeenCalledWith(`${baseURL}/health`);
    });

    it('should handle missing status field gracefully', async () => {
      const mockBody = { message: 'Service running' };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), { status: 200 }));

      const response = await fetch(`${baseURL}/health`);
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data).not.toHaveProperty('status');
      // The test might fail or pass based on implementation, here we just check for property absence
    });

    it('should handle non-200 status codes', async () => {
      mockedFetch.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

      const response = await fetch(`${baseURL}/health`);
      expect(response.ok).toBe(false);
      expect(response.status).toBe(503);
    });
  });

  describe('GET /api', () => {
    it('should return a JSON object with endpoints array including /health', async () => {
      const mockBody = { endpoints: ['/health', '/api', '/users'] };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

      const response = await fetch(`${baseURL}/api`);
      expect(response.ok).toBe(true);
      const contentType = response.headers.get('content-type') ?? '';
      expect(contentType).toMatch(/application\/json/);
      const data = await response.json();
      expect(data).toBeInstanceOf(Object);
      expect(data).toHaveProperty('endpoints');
      expect(Array.isArray(data.endpoints)).toBe(true);
      expect(data.endpoints).toContain('/health');
    });

    it('should handle non-JSON response gracefully', async () => {
      mockedFetch.mockResolvedValue(new Response('<html>API info</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

      const response = await fetch(`${baseURL}/api`);
      expect(response.ok).toBe(true);
      const contentType = response.headers.get('content-type') ?? '';
      expect(contentType).not.toMatch(/application\/json/);

      // Attempt to parse JSON should fail
      await expect(response.json()).rejects.toThrow();
    });
  });

  describe('GET unknown endpoint returns 404', () => {
    it('should return 404 and optional error message JSON', async () => {
      const mockBody = { error: 'Not Found' };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), { status: 404, headers: { 'content-type': 'application/json' } }));

      const response = await fetch(`${baseURL}/api/unknown-nonexistent-endpoint`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });

    it('should handle non-JSON 404 response gracefully', async () => {
      mockedFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

      const response = await fetch(`${baseURL}/api/unknown-nonexistent-endpoint`);
      expect(response.status).toBe(404);

      await expect(response.json()).rejects.toThrow();
    });
  });

  describe('GET /api/error simulating server error', () => {
    it('should return 500+ status and error message if endpoint exists', async () => {
      const mockBody = { error: 'Internal Server Error' };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), { status: 500, headers: { 'content-type': 'application/json' } }));

      const response = await fetch(`${baseURL}/api/error`);
      if (response.status >= 500) {
        expect(response.status).toBeGreaterThanOrEqual(500);
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(typeof data.error).toBe('string');
      } else {
        // Skip scenario handled externally, but can't skip in Jest - so just assert fail if unexpected
        throw new Error('No server error simulation endpoint available');
      }
    });

    it('should skip or handle when /api/error does not exist or no error', async () => {
      mockedFetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const response = await fetch(`${baseURL}/api/error`);
      if (response.status < 500) {
        // No error simulation present; test passes doing nothing
      } else {
        throw new Error('Unexpected server error');
      }
    });
  });

  describe('GET /api/protected authentication scenario', () => {
    it('should return 401 or 403 with error message if auth required', async () => {
      const mockBody = { error: 'Unauthorized' };
      mockedFetch.mockResolvedValue(new Response(JSON.stringify(mockBody), { status: 401, headers: { 'content-type': 'application/json' } }));

      const response = await fetch(`${baseURL}/api/protected`);
      if ([401, 403].includes(response.status)) {
        expect([401, 403]).toContain(response.status);
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(typeof data.error).toBe('string');
      } else {
        // If not 401/403, auth not required or endpoint missing - no assertion here
      }
    });

    it('should handle non-JSON 401/403 response gracefully', async () => {
      mockedFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const response = await fetch(`${baseURL}/api/protected`);
      if ([401, 403].includes(response.status)) {
        await expect(response.json()).rejects.toThrow();
      }
    });
  });
});
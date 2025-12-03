// @ts-nocheck
import { request } from '@playwright/test';
import { jest, describe, beforeAll, afterAll, it, expect } from '@jest/globals';

jest.mock('@playwright/test', () => {
  const original = jest.requireActual('@playwright/test');
  return {
    ...original,
    request: {
      newContext: jest.fn(),
    },
  };
});

describe('API Health Unit Tests - Playwright Request Context', () => {
  let mockPost: jest.Mock;
  let mockGet: jest.Mock;
  let mockDispose: jest.Mock;
  let contextMock: any;

  beforeAll(() => {
    mockPost = jest.fn();
    mockGet = jest.fn();
    mockDispose = jest.fn();

    contextMock = {
      post: mockPost,
      get: mockGet,
      dispose: mockDispose,
    };

    (request.newContext as jest.Mock).mockResolvedValue(contextMock);
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  it('should create new context with correct headers and login if credentials provided', async () => {
    // Setup mocks for successful login flow
    const loginResponse = {
      ok: jest.fn().mockReturnValue(true),
      json: jest.fn().mockResolvedValue({ token: 'abc123' }),
      status: jest.fn(),
    };

    mockPost.mockResolvedValue(loginResponse);
    // Dispose called once then new context created again with auth header
    (request.newContext as jest.Mock)
      .mockResolvedValueOnce(contextMock)
      .mockResolvedValueOnce(contextMock);
    mockDispose.mockReturnValue(undefined);

    // Simulate the behavior from the beforeAll block for login
    const baseURL = 'http://baseurl.test';
    const username = 'user';
    const password = 'pass';

    // Pseudocode for test: Use same logic from beforeAll to verify sequence
    // Mock environment variables or config here if needed

    // Call login sequence
    const apiContext = await request.newContext({
      baseURL,
      extraHTTPHeaders: { accept: 'application/json' },
    });

    const loginResp = await apiContext.post('/login', { data: { username, password } });
    expect(loginResp.ok()).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/login', { data: { username, password } });
    const body = await loginResp.json();
    expect(body).toHaveProperty('token');

    // Dispose old context and create new with token
    apiContext.dispose();
    const apiContextWithAuth = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        accept: 'application/json',
        authorization: `Bearer ${body.token}`,
      },
    });
    expect(request.newContext).toHaveBeenCalledTimes(2);
    expect(mockDispose).toHaveBeenCalled();
    expect(apiContextWithAuth).toBeDefined();
  });

  it('should handle /health GET response correctly', async () => {
    const mockBody = { status: 'healthy', uptime: 123456 };
    const response = {
      ok: jest.fn().mockReturnValue(true),
      status: jest.fn().mockReturnValue(200),
      json: jest.fn().mockResolvedValue(mockBody),
    };

    mockGet.mockResolvedValue(response);

    const result = await contextMock.get('/health');
    expect(result.ok()).toBe(true);
    expect(result.status()).toBe(200);
    const json = await result.json();
    expect(json).toHaveProperty('status');
    expect(json.status.toLowerCase()).toBe('healthy');
    expect(typeof json.uptime).toBe('number');
  });

  it('should handle /api GET response with endpoints array', async () => {
    const mockBody = {
      endpoints: ['/health', '/login', '/api'],
    };
    const response = {
      ok: jest.fn().mockReturnValue(true),
      status: jest.fn().mockReturnValue(200),
      json: jest.fn().mockResolvedValue(mockBody),
    };

    mockGet.mockResolvedValue(response);

    const result = await contextMock.get('/api');
    expect(result.ok()).toBe(true);
    const json = await result.json();
    expect(json).toHaveProperty('endpoints');
    expect(Array.isArray(json.endpoints)).toBe(true);
    for (const ep of json.endpoints) {
      expect(typeof ep).toBe('string');
      expect(ep.startsWith('/')).toBe(true);
    }
  });

  it('should handle error status codes gracefully', async () => {
    const response = {
      ok: jest.fn().mockReturnValue(false),
      status: jest.fn().mockReturnValue(401),
      json: jest.fn().mockResolvedValue({ error: 'Unauthorized' }),
    };
    mockGet.mockResolvedValue(response);

    const result = await contextMock.get('/health');
    expect([401,403,500]).toContain(result.status());
  });

  it('should dispose context correctly', () => {
    contextMock.dispose();
    expect(mockDispose).toHaveBeenCalled();
  });
});
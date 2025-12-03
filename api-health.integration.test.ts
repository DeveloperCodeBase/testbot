// @ts-nocheck
import request from 'supertest';

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const username = process.env.TEST_USER || '';
const password = process.env.TEST_PASSWORD || '';

let authToken: string | null = null;
let apiRequest: request.SuperTest<request.Test>;

beforeAll(async () => {
  apiRequest = request(baseURL);

  if (username && password) {
    const loginRes = await apiRequest
      .post('/login')
      .send({ username, password })
      .set('Accept', 'application/json');
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
    authToken = loginRes.body.token;
  }
});

describe('API Health Integration Tests', () => {
  describe('/health endpoint', () => {
    it('should respond with 200 status, healthy status and correct schema', async () => {
      const res = authToken
        ? await apiRequest.get('/health').set('Authorization', `Bearer ${authToken}`)
        : await apiRequest.get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(['healthy', 'ok', 'up']).toContain(res.body.status.toLowerCase());

      if ('uptime' in res.body) {
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      }

      if ('version' in res.body) expect(typeof res.body.version).toBe('string');

      if ('db' in res.body) {
        expect(res.body.db).toHaveProperty('status');
        expect(['healthy', 'ok', 'up', 'connected']).toContain(res.body.db.status.toLowerCase());
      }
    });

    it('should handle error scenario gracefully', async () => {
      if (authToken) {
        // Simulate invalid token
        const badRes = await apiRequest
          .get('/health')
          .set('Authorization', 'Bearer invalidtoken123')
          .set('Accept', 'application/json');
        expect([401, 403, 500]).toContain(badRes.status);
      } else {
        // Request invalid endpoint
        const badRes = await apiRequest.get('/health-invalid');
        expect(badRes.status).toBe(404);
      }
    });

    it('should respect authentication requirements', async () => {
      if (authToken) {
        // Without auth header expect 401 or 403
        const noAuthRes = await apiRequest.get('/health').set('Accept', 'application/json');
        expect([401, 403]).toContain(noAuthRes.status);
      } else {
        // No auth required - endpoint accessible
        const res = await apiRequest.get('/health');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('/api root endpoint', () => {
    it('should respond with 200 and list available endpoints or description', async () => {
      const res = authToken
        ? await apiRequest.get('/api').set('Authorization', `Bearer ${authToken}`)
        : await apiRequest.get('/api');
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      expect(typeof res.body === 'object' || Array.isArray(res.body)).toBe(true);

      if (Array.isArray(res.body.endpoints)) {
        expect(res.body.endpoints.length).toBeGreaterThan(0);
        for (const ep of res.body.endpoints) {
          expect(typeof ep).toBe('string');
          expect(ep.startsWith('/')).toBe(true);
        }
      }
    });

    it('should respect authentication requirements', async () => {
      if (authToken) {
        const noAuthRes = await apiRequest.get('/api').set('Accept', 'application/json');
        expect([401, 403]).toContain(noAuthRes.status);
      } else {
        const res = await apiRequest.get('/api');
        expect(res.status).toBe(200);
      }
    });
  });
});

// Additional teardown if needed
afterAll(async () => {
  // nothing to dispose explicitly here for supertest
});
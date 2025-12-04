// @ts-nocheck
import request from 'supertest';
import app from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('E2E tests for API Gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should perform full user workflow: health check, get users, add user, get analytics', async () => {
    // 1. Health check
    let response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });

    // 2. Get users
    response = await request(app).get('/users');
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, name: 'Alice' }),
        expect.objectContaining({ id: 2, name: 'Bob' }),
      ])
    );

    // 3. Add a new user
    jest.spyOn(global.Math, 'random').mockReturnValue(0.333); // id 333
    const newUser = { name: 'Dana' };
    response = await request(app).post('/users').send(newUser);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'Dana', id: 333 });
    (global.Math.random as jest.Mock).mockRestore();

    // 4. Get analytics summary
    mockedAxios.get.mockResolvedValueOnce({ data: { totalUsers: 3, activeUsers: 2 } });
    response = await request(app).get('/analytics/summary');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ summary: { totalUsers: 3, activeUsers: 2 } });
  });

  it('should handle analytics service failure gracefully in E2E', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Analytics service down'));

    const response = await request(app).get('/analytics/summary');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch analytics' });
  });
});
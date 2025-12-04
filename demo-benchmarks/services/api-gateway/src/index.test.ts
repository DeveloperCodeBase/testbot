// @ts-nocheck
import request from 'supertest';
import axios from 'axios';
import app from './index';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Express API Gateway - Unit and Integration Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Unit tests - route handlers', () => {
    describe('GET /health', () => {
      it('should return status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
      });
    });

    describe('GET /users', () => {
      it('should return an array of users', async () => {
        const res = await request(app).get('/users');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]);
      });
    });

    describe('POST /users', () => {
      it('should create a new user returning the user with an id', async () => {
        const newUser = { name: 'Charlie', age: 30 };
        const res = await request(app).post('/users').send(newUser);
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject(newUser);
        expect(typeof res.body.id).toBe('number');
        expect(res.body.id).toBeGreaterThanOrEqual(0);
        expect(res.body.id).toBeLessThan(1000);
      });

      it('should handle empty body and create user with empty fields', async () => {
        const res = await request(app).post('/users').send({});
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(typeof res.body.id).toBe('number');
      });
    });

    describe('GET /analytics/summary', () => {
      it('should return summary data from analytics service', async () => {
        const mockData = { totalUsers: 123, activeUsers: 45 };
        mockedAxios.get.mockResolvedValueOnce({ data: mockData });

        const res = await request(app).get('/analytics/summary');
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ summary: mockData });
      });

      it('should return 500 and error message if analytics service call fails', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Service unavailable'));

        const res = await request(app).get('/analytics/summary');
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to fetch analytics' });
      });
    });
  });
});
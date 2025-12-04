// @ts-nocheck
import request from 'supertest';
import app from '../index';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Integration tests for API endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should respond with status ok JSON', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /users', () => {
    it('should respond with list of users', async () => {
      const response = await request(app).get('/users');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
    });
  });

  describe('POST /users', () => {
    it('should create user and respond with 201 and new user id', async () => {
      // Spy on Math.random to produce predictable ID
      jest.spyOn(global.Math, 'random').mockReturnValue(0.42);

      const newUser = { name: 'Eve' };
      const response = await request(app).post('/users').send(newUser);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', 'Eve');
      expect(response.body).toHaveProperty('id', Math.floor(0.42 * 1000));

      (global.Math.random as jest.Mock).mockRestore();
    });

    it('should handle empty user object', async () => {
      jest.spyOn(global.Math, 'random').mockReturnValue(0.77);

      const response = await request(app).post('/users').send({});

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', Math.floor(0.77 * 1000));
      expect(Object.keys(response.body).length).toBe(1);

      (global.Math.random as jest.Mock).mockRestore();
    });
  });

  describe('GET /analytics/summary', () => {
    it('should respond with analytics summary data on success', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { totalUsers: 50, activeUsers: 25 } });

      const response = await request(app).get('/analytics/summary');

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        summary: { totalUsers: 50, activeUsers: 25 },
      });
    });

    it('should respond with 500 error on axios failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Service down'));

      const response = await request(app).get('/analytics/summary');

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch analytics' });
    });
  });
});
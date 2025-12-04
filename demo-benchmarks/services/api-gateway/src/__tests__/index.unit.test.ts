import app from '../index';
import axios from 'axios';
import request from 'supertest';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Unit Tests - API Gateway Handlers', () => {
  describe('GET /health handler', () => {
    it('should return status ok', () => {
      // We test handler output via supertest (closest to unit without refactor)
      return request(app)
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect({ status: 'ok' });
    });
  });

  describe('GET /users handler', () => {
    it('should return a list of users', () => {
      return request(app)
        .get('/users')
        .expect(200)
        .expect('Content-Type', /json/)
        .then((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: 1, name: 'Alice' }),
              expect.objectContaining({ id: 2, name: 'Bob' }),
            ])
          );
        });
    });
  });

  describe('POST /users handler', () => {
    it('should create a user and return with an id', () => {
      const newUser = { name: 'Charlie', age: 30 };

      return request(app)
        .post('/users')
        .send(newUser)
        .expect(201)
        .expect('Content-Type', /json/)
        .then((res) => {
          expect(res.body).toMatchObject(newUser);
          expect(typeof res.body.id).toBe('number');
          expect(res.body.id).toBeGreaterThanOrEqual(0);
          expect(res.body.id).toBeLessThan(1000);
        });
    });

    it('should handle empty body and still assign an id', () => {
      return request(app)
        .post('/users')
        .send({})
        .expect(201)
        .then((res) => {
          expect(res.body).toHaveProperty('id');
          expect(typeof res.body.id).toBe('number');
        });
    });
  });

  describe('GET /analytics/summary handler', () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should return summary data from python service', async () => {
      const fakeData = { active: 10, inactive: 5 };
      mockedAxios.get.mockResolvedValueOnce({ data: fakeData });

      const response = await request(app).get('/analytics/summary');

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ summary: fakeData });
    });

    it('should return 500 and error message when axios call fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const response = await request(app).get('/analytics/summary');

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch analytics' });
    });
  });
});
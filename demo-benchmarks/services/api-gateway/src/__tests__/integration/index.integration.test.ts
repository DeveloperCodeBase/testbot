// @ts-nocheck
import request from 'supertest';
import app from '../src/index';
import axios from 'axios';

jest.mock('axios');

describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });
});

describe('GET /users', () => {
    it('should return user list', async () => {
        const res = await request(app).get('/users');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
    });
});

describe('POST /users', () => {
    it('should create a new user with an id', async () => {
        const user = { name: 'Charlie' };
        const res = await request(app).post('/users').send(user);
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe(user.name);
    });
});

describe('GET /analytics/summary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return analytics summary when external service is available', async () => {
        (axios.get as jest.Mock).mockResolvedValueOnce({ data: { users: 150 } });
        const res = await request(app).get('/analytics/summary');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ summary: { users: 150 } });
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
    });

    it('should return 500 error when external service is unreachable', async () => {
        (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable'));
        const res = await request(app).get('/analytics/summary');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to fetch analytics' });
    });
});
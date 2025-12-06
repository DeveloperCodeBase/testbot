// @ts-nocheck
import request from 'supertest';
import express from 'express';
import app from '../src/index';

// Mock Python service
const pythonServer = express();
pythonServer.get('/stats/users', (req, res) => {
    res.json({ total: 100 });
});
const PORT_PYTHON = 8000;

let pythonServerInstance: any;
beforeAll((done) => {
    pythonServerInstance = pythonServer.listen(PORT_PYTHON, done);
});
afterAll(() => {
    pythonServerInstance.close();
});

describe('End-to-End tests', () => {
    describe('GET /analytics/summary', () => {
        it('should fetch analytics summary from Python service', async () => {
            const response = await request(app).get('/analytics/summary');
            expect(response.status).toBe(200);
            expect(response.body.summary).toEqual({ total: 100 });
        });
    });
});
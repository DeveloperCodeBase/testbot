// @ts-nocheck
import * as express from 'express';
import { Express } from 'express';
import axios from 'axios';

jest.mock('axios');

const app = express();
app.use(express.json());

// Define the /analytics/summary route (replicating the original code)
app.get('/analytics/summary', async (req, res) => {
    try {
        const response = await axios.get('http://localhost:8000/stats/users');
        res.json({ summary: response.data });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

describe('Unit Test for /analytics/summary route handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return the summary from the external service', async () => {
        const mockData = { totalUsers: 100 };
        (axios.get as jest.MockedFunction<typeof axios.get>).mockResolvedValueOnce({ data: mockData });

        const mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
        };

        const req = {} as express.Request;
        await app._router.handle(req, mockRes as any, () => {});

        expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
        expect(mockRes.json).toHaveBeenCalledWith({ summary: mockData });
    });

    it('should handle error from external service', async () => {
        const error = new Error('Service unavailable');
        (axios.get as jest.MockedFunction<typeof axios.get>).mockRejectedValueOnce(error);

        const mockRes = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };

        const req = {} as express.Request;
        await app._router.handle(req, mockRes as any, () => {});

        expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/stats/users');
        expect((mockRes.status as jest.Mock).mock.calls[0][0]).toBe(500);
        expect((mockRes.send as jest.Mock).mock.calls[0][0]).toEqual({ error: 'Failed to fetch analytics' });
    });
});
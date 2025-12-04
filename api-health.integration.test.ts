// @ts-nocheck
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { jest } from '@jest/globals';

// Mock database and service layer
const mockDb = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  getStatus: jest.fn(),
};
const mockService = {
  checkHealth: jest.fn(),
};

// Simple Express app simulating api-health endpoints for integration tests
const createApp = () => {
  const app = express();

  // Middleware to simulate DB connection status
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!mockDb.connect()) {
      return res.status(500).json({ status: 'error', message: 'DB connection failed' });
    }
    next();
  });

  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const serviceStatus = await mockService.checkHealth();
      const dbStatus = await mockDb.getStatus();

      if (serviceStatus !== 'ok' || dbStatus !== 'ok') {
        return res.status(503).json({ status: 'unhealthy', details: { service: serviceStatus, database: dbStatus } });
      }

      res.status(200).json({ status: 'ok' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
  });

  return app;
};

describe('API Health Integration Tests', () => {
  let app: express.Express;
  let server: Server;

  beforeAll(() => {
    app = createApp();
    // Simulate DB always available/connects during test lifetime
    mockDb.connect.mockReturnValue(true);
    server = app.listen(0); // bind to random free port
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 and status ok when service and database are healthy', async () => {
    mockService.checkHealth.mockResolvedValue('ok');
    mockDb.getStatus.mockResolvedValue('ok');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(mockService.checkHealth).toHaveBeenCalledTimes(1);
    expect(mockDb.getStatus).toHaveBeenCalledTimes(1);
    expect(mockDb.connect).toHaveBeenCalledTimes(1);
  });

  it('should return 503 when service is unhealthy but database is healthy', async () => {
    mockService.checkHealth.mockResolvedValue('fail');
    mockDb.getStatus.mockResolvedValue('ok');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.details).toMatchObject({ service: 'fail', database: 'ok' });
  });

  it('should return 503 when database is unhealthy but service is healthy', async () => {
    mockService.checkHealth.mockResolvedValue('ok');
    mockDb.getStatus.mockResolvedValue('fail');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.details).toMatchObject({ service: 'ok', database: 'fail' });
  });

  it('should return 500 if DB connection check fails before handling request', async () => {
    mockDb.connect.mockReturnValue(false);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 'error', message: 'DB connection failed' });

    mockDb.connect.mockReturnValue(true); // revert for other tests
  });

  it('should return 500 if service throws an error', async () => {
    mockService.checkHealth.mockRejectedValue(new Error('Service failure'));
    mockDb.getStatus.mockResolvedValue('ok');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ status: 'error', message: 'Internal Server Error' });
  });

  it('should handle unexpected values gracefully', async () => {
    mockService.checkHealth.mockResolvedValue(undefined);
    mockDb.getStatus.mockResolvedValue(null);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.details).toMatchObject({ service: undefined, database: null });
  });
});
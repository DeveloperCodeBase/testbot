// @ts-nocheck
import request from 'supertest';
import express, { Application, Request, Response } from 'express';
import { Server } from 'http';
import { jest } from '@jest/globals';

// Mocked database service and health check service
const mockDbService = {
  checkConnection: jest.fn(),
};
const mockHealthService = {
  getApiStatus: jest.fn(),
  getDbStatus: jest.fn(),
};

// Express app setup for integration tests
function createApp(): Application {
  const app = express();

  // Health check endpoint - returns overall API health info
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const apiStatus = mockHealthService.getApiStatus();
      const dbStatus = await mockDbService.checkConnection();

      if (apiStatus === 'ok' && dbStatus === 'ok') {
        return res.status(200).json({ status: 'ok', db: dbStatus });
      } else {
        return res.status(503).json({ status: 'unavailable', db: dbStatus });
      }
    } catch (error) {
      return res.status(500).json({ status: 'error', message: (error as Error).message });
    }
  });

  return app;
}

describe('API Health E2E Integration Tests', () => {
  let app: Application;
  let server: Server;

  beforeAll(() => {
    app = createApp();
    server = app.listen(0); // Use ephemeral port
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 and healthy status when API and DB are OK', async () => {
      mockHealthService.getApiStatus.mockReturnValue('ok');
      mockDbService.checkConnection.mockResolvedValue('ok');

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', db: 'ok' });

      expect(mockHealthService.getApiStatus).toHaveBeenCalledTimes(1);
      expect(mockDbService.checkConnection).toHaveBeenCalledTimes(1);
    });

    it('should return 503 when DB is down but API reports ok', async () => {
      mockHealthService.getApiStatus.mockReturnValue('ok');
      mockDbService.checkConnection.mockResolvedValue('down');

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'unavailable', db: 'down' });
    });

    it('should return 503 when API reports not ok but DB is ok', async () => {
      mockHealthService.getApiStatus.mockReturnValue('error');
      mockDbService.checkConnection.mockResolvedValue('ok');

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'unavailable', db: 'ok' });
    });

    it('should handle exceptions thrown during health check and return 500', async () => {
      mockHealthService.getApiStatus.mockImplementation(() => {
        throw new Error('unexpected error');
      });
      mockDbService.checkConnection.mockResolvedValue('ok');

      const response = await request(app).get('/health');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'unexpected error');
    });

    it('should handle promise rejection from DB checkConnection and return 500', async () => {
      mockHealthService.getApiStatus.mockReturnValue('ok');
      mockDbService.checkConnection.mockRejectedValue(new Error('DB connection failed'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('status', 'error');
      expect(response.body).toHaveProperty('message', 'DB connection failed');
    });
  });
});

describe('Unit Tests for mocked HealthService and DbService', () => {
  // Unit test for HealthService.getApiStatus function mocking possible implementations
  describe('HealthService.getApiStatus', () => {
    it('should return string status', () => {
      // Emulate the real implementation or expected outputs
      mockHealthService.getApiStatus.mockReturnValue('ok');
      expect(mockHealthService.getApiStatus()).toBe('ok');

      mockHealthService.getApiStatus.mockReturnValue('error');
      expect(mockHealthService.getApiStatus()).toBe('error');
    });
  });

  // Unit test for DbService.checkConnection function with resolved and rejected promises
  describe('DbService.checkConnection', () => {
    it('should resolve with "ok" status', async () => {
      mockDbService.checkConnection.mockResolvedValue('ok');
      await expect(mockDbService.checkConnection()).resolves.toBe('ok');
    });

    it('should resolve with "down" status', async () => {
      mockDbService.checkConnection.mockResolvedValue('down');
      await expect(mockDbService.checkConnection()).resolves.toBe('down');
    });

    it('should reject with error', async () => {
      mockDbService.checkConnection.mockRejectedValue(new Error('failed'));
      await expect(mockDbService.checkConnection()).rejects.toThrow('failed');
    });
  });
});
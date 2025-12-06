// @ts-nocheck
import request from 'supertest';
import { Express } from 'express';
import { createTestServer } from '../../app'; // Assume there's a function to create a server for testing
import { getDatabaseConnection, closeDatabaseConnection } from '../../database'; // Assume these functions exist
import { HealthService } from '../../services/health.service'; // Assume this service exists
import * as healthController from '../../controllers/health.controller'; // Assume this controller exists

let app: Express;
let healthServiceMock: jest.Mocked<HealthService>;

beforeAll(async () => {
  healthServiceMock = {
    checkDatabaseConnection: jest.fn(),
    checkExternalServices: jest.fn(),
  } as unknown as jest.Mocked<HealthService>;
  jest.mock('../../services/health.service', () => ({
    HealthService: jest.fn(() => healthServiceMock),
  }));
  await getDatabaseConnection(); // Connect to the database
  app = createTestServer();
});

afterAll(async () => {
  await closeDatabaseConnection(); // Close the database connection
});

describe('API Health Integration Tests', () => {
  describe('GET /health', () => {
    it('should return 200 OK with health status', async () => {
      healthServiceMock.checkDatabaseConnection.mockResolvedValue(true);
      healthServiceMock.checkExternalServices.mockResolvedValue(['Service A', 'Service B']);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('databaseConnected', true);
      expect(response.body).toHaveProperty('externalServices');
      expect(response.body.externalServices).toHaveLength(2);
    });

    it('should return 503 Service Unavailable if database connection fails', async () => {
      healthServiceMock.checkDatabaseConnection.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('message', 'Database connection failed');
    });

    it('should handle error from external service checks gracefully', async () => {
      healthServiceMock.checkDatabaseConnection.mockResolvedValue(true);
      healthServiceMock.checkExternalServices.mockRejectedValue(new Error('External service check failed'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('message', 'External service check failed');
    });
  });
});
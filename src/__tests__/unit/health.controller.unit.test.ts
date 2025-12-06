// @ts-nocheck
import { checkHealth } from '../../controllers/health.controller';
import { createMockRequest, createMockResponse } from '../mocks/requestResponse.mocks'; // Assume these utilities exist
import { HealthService } from '../../services/health.service'; // Assume this service exists

let healthServiceMock: jest.Mocked<HealthService>;

beforeEach(() => {
  healthServiceMock = {
    checkDatabaseConnection: jest.fn(),
    checkExternalServices: jest.fn(),
  } as unknown as jest.Mocked<HealthService>;
  jest.mock('../../services/health.service', () => ({
    HealthService: jest.fn(() => healthServiceMock),
  }));
});

describe('Health Controller Unit Tests', () => {
  describe('checkHealth', () => {
    it('should send a 200 response with health status', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      healthServiceMock.checkDatabaseConnection.mockResolvedValue(true);
      healthServiceMock.checkExternalServices.mockResolvedValue(['Service A', 'Service B']);

      await checkHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        databaseConnected: true,
        externalServices: ['Service A', 'Service B'],
      });
    });

    it('should send a 503 response if database connection fails', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      healthServiceMock.checkDatabaseConnection.mockRejectedValue(new Error('Database connection failed'));

      await checkHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Database connection failed',
      });
    });

    it('should send a 503 response if external service check fails', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      healthServiceMock.checkDatabaseConnection.mockResolvedValue(true);
      healthServiceMock.checkExternalServices.mockRejectedValue(new Error('External service check failed'));

      await checkHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        message: 'External service check failed',
      });
    });
  });
});
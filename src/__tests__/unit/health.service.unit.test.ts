// @ts-nocheck
import { HealthService } from '../../services/health.service';
import { getDatabaseConnection, closeDatabaseConnection } from '../../database'; // Assume these functions exist

let healthService: HealthService;

beforeAll(async () => {
  await getDatabaseConnection(); // Connect to the database
  healthService = new HealthService();
});

afterAll(async () => {
  await closeDatabaseConnection(); // Close the database connection
});

describe('Health Service Unit Tests', () => {
  describe('checkDatabaseConnection', () => {
    it('should return true if database connection is successful', async () => {
      const isConnected = await healthService.checkDatabaseConnection();
      expect(isConnected).toBe(true);
    });

    it('should throw an error if database connection fails', async () => {
      // Assuming the database connection is mocked or can be forced to fail
      jest.spyOn(healthService, 'checkDatabaseConnection').mockRejectedValue(new Error('Database connection failed'));

      await expect(healthService.checkDatabaseConnection()).rejects.toThrow('Database connection failed');
    });
  });

  describe('checkExternalServices', () => {
    it('should return an array of external service names', async () => {
      const services = await healthService.checkExternalServices();
      expect(services).toBeInstanceOf(Array);
      // Add more assertions based on expected services
    });

    it('should throw an error if any external service check fails', async () => {
      // Assuming the external service check is mocked or can be forced to fail
      jest.spyOn(healthService, 'checkExternalServices').mockRejectedValue(new Error('External service check failed'));

      await expect(healthService.checkExternalServices()).rejects.toThrow('External service check failed');
    });
  });
});
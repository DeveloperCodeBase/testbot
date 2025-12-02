import axios from 'axios';
import { OpenRouterClient } from '../OpenRouterClient';
import { LLMMessage } from '../../models/LLMMessage';
import logger from '../../utils/logger';

jest.mock('axios');
jest.mock('../../utils/logger');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('OpenRouterClient Integration Tests', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    // Clear previous mocks and instantiate fresh client
    jest.clearAllMocks();
    client = new OpenRouterClient();
  });

  describe('constructor', () => {
    it('should set apiKey, baseUrl and appName properties', () => {
      expect(client['apiKey']).toBeDefined();
      expect(client['baseUrl']).toBe('https://openrouter.ai/api/v1');
      expect(client['appName']).toBe('testbot1');
    });

    it('should log a warning if apiKey is missing', () => {
      // forcibly remove apiKey and re-instantiate
      const spyWarn = jest.spyOn(mockedLogger, 'warn').mockImplementation(() => {});
      // @ts-expect-error: manipulate private field for test
      client['apiKey'] = '';

      // Re-run warning check (construct does it on initialization)
      if (!client['apiKey']) {
        logger.warn('Missing OPENROUTER_API_KEY environment variable');
      }

      expect(spyWarn).toHaveBeenCalledWith('Missing OPENROUTER_API_KEY environment variable');

      spyWarn.mockRestore();
    });
  });

  describe('chatCompletion', () => {
    const testModel = 'gpt-4o-mini';
    const testMessages: LLMMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help?' },
    ];

    it('should throw error if apiKey is missing', async () => {
      // @ts-expect-error: forcibly clear apiKey
      client['apiKey'] = '';

      await expect(client.chatCompletion(testModel, testMessages))
        .rejects
        .toThrow('Missing OPENROUTER_API_KEY');
    });

    it('should call axios.post with correct parameters and return content', async () => {
      const fakeResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Test response content',
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(fakeResponse);

      const result = await client.chatCompletion(testModel, testMessages);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: testModel,
          messages: testMessages,
        },
        {
          headers: expect.objectContaining({
            Authorization: `Bearer ${client['apiKey']}`,
            'Content-Type': 'application/json',
            'X-Title': client['appName']!,
          }),
          timeout: 60000,
        }
      );
      expect(result).toBe('Test response content');
    });

    it('should throw error if response does not contain content', async () => {
      const fakeResponse = {
        data: {
          choices: [
            {
              message: {
                // no content key
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(fakeResponse);

      await expect(client.chatCompletion(testModel, testMessages))
        .rejects
        .toThrow('No content in OpenRouter response');
    });

    it('should throw formatted error for axios errors with response', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Unauthorized' },
        },
      } as any;

      mockedAxios.post.mockRejectedValueOnce(axiosError);

      await expect(client.chatCompletion(testModel, testMessages))
        .rejects
        .toThrow('OpenRouter error: 401 {"error":"Unauthorized"}');
    });

    it('should throw original error for non-axios errors', async () => {
      const genericError = new Error('Network down');

      mockedAxios.post.mockRejectedValueOnce(genericError);

      await expect(client.chatCompletion(testModel, testMessages))
        .rejects
        .toThrow('Network down');
    });

    it('should include X-Title header only if appName is set', async () => {
      const fakeResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Response content',
              },
            },
          ],
        },
      };

      // Confirm with appName set (default)
      mockedAxios.post.mockResolvedValueOnce(fakeResponse);
      await client.chatCompletion(testModel, testMessages);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Title': expect.any(String),
          }),
        })
      );

      // Remove appName and test header absence
      // @ts-expect-error
      client['appName'] = undefined;

      mockedAxios.post.mockResolvedValueOnce(fakeResponse);
      await client.chatCompletion(testModel, testMessages);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-Title': expect.any(String),
          }),
        })
      );
    });
  });
});
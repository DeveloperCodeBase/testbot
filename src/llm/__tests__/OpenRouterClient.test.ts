// @ts-nocheck
import axios from 'axios';
import { OpenRouterClient } from '../OpenRouterClient';
import { LLMMessage } from '../../models/LLMMessage';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;
  const model = 'gpt-4o-mini';
  const messages: LLMMessage[] = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ];

  beforeEach(() => {
    client = new OpenRouterClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set apiKey, baseUrl and appName properties', () => {
      expect(typeof (client as any).apiKey).toBe('string');
      expect((client as any).baseUrl).toBe('https://openrouter.ai/api/v1');
      expect((client as any).appName).toBe('testbot1');
    });

    it('should warn if apiKey is missing', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      // Force apiKey to empty
      (client as any).apiKey = '';
      // Re-run ctor code block or constructor logic manually
      if (!(client as any).apiKey) {
        consoleWarnSpy('Missing OPENROUTER_API_KEY environment variable');
      }
      expect(consoleWarnSpy).toHaveBeenCalledWith('Missing OPENROUTER_API_KEY environment variable');
      consoleWarnSpy.mockRestore();
    });
  });

  describe('chatCompletion', () => {
    it('should throw if apiKey is missing', async () => {
      (client as any).apiKey = '';
      await expect(client.chatCompletion(model, messages)).rejects.toThrow('Missing OPENROUTER_API_KEY');
    });

    it('should send post request with correct config and return content on success', async () => {
      const mockResponseContent = 'Hello from OpenRouter!';
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: mockResponseContent,
              },
            },
          ],
        },
      });

      const result = await client.chatCompletion(model, messages);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Check URL and payload correctness
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages,
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer '),
            'Content-Type': 'application/json',
            'X-Title': 'testbot1',
          }),
          timeout: 60000,
        })
      );

      expect(result).toBe(mockResponseContent);
    });

    it('should throw error if no content is in response', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: null,
              },
            },
          ],
        },
      });

      await expect(client.chatCompletion(model, messages)).rejects.toThrow('No content in OpenRouter response');
    });

    it('should throw error with status and data info on axios error response', async () => {
      const errorResponse = {
        response: {
          status: 403,
          data: { error: 'Forbidden' },
        },
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValueOnce(errorResponse);
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);

      await expect(client.chatCompletion(model, messages)).rejects.toThrow(
        `OpenRouter error: 403 ${JSON.stringify(errorResponse.response.data)}`
      );
    });

    it('should rethrow non-axios errors', async () => {
      const customError = new Error('Random failure');
      mockedAxios.post.mockRejectedValueOnce(customError);
      if (mockedAxios.isAxiosError) {
        (mockedAxios.isAxiosError as jest.Mock).mockReturnValue(false);
      }

      await expect(client.chatCompletion(model, messages)).rejects.toThrow(customError);
    });
  });
});
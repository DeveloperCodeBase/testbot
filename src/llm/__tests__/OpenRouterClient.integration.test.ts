// @ts-nocheck
import axios from 'axios';
import { OpenRouterClient } from '../OpenRouterClient';
import { LLMMessage } from '../../models/LLMMessage';

jest.mock('axios');

describe('OpenRouterClient Integration Tests', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    client = new OpenRouterClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set apiKey, baseUrl, and appName', () => {
      expect((client as any).apiKey).toMatch(/^sk-or-v1-/);
      expect((client as any).baseUrl).toBe('https://openrouter.ai/api/v1');
      expect((client as any).appName).toBe('testbot1');
    });
  });

  describe('chatCompletion', () => {
    const model = 'test-model';
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    it('should successfully return content from API response', async () => {
      const content = 'Response content from model';

      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        },
      });

      const response = await client.chatCompletion(model, messages);

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        { model, messages },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${(client as any).apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': (client as any).appName,
          }),
          timeout: 60000,
        })
      );
      expect(response).toBe(content);
    });

    it('should throw an error if apiKey is missing', async () => {
      // forcibly set apiKey to empty
      (client as any).apiKey = '';

      await expect(client.chatCompletion(model, messages)).rejects.toThrow(
        'Missing OPENROUTER_API_KEY'
      );
    });

    it('should throw an error if response has no content', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          choices: [{}],
        },
      });

      await expect(client.chatCompletion(model, messages)).rejects.toThrow(
        'No content in OpenRouter response'
      );
    });

    it('should catch axios error and throw formatted error with status and data', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: { error: 'Unauthorized' },
        },
        toJSON: () => ({}),
      };
      (axios.isAxiosError as jest.Mock).mockReturnValue(true);
      (axios.post as jest.Mock).mockRejectedValue(axiosError);

      await expect(client.chatCompletion(model, messages)).rejects.toThrow(
        /^OpenRouter error: 401 /
      );
    });

    it('should rethrow non-axios errors', async () => {
      (axios.isAxiosError as jest.Mock).mockReturnValue(false);

      const customError = new Error('Custom error');
      (axios.post as jest.Mock).mockRejectedValue(customError);

      await expect(client.chatCompletion(model, messages)).rejects.toBe(customError);
    });

    it('should include X-Title header only if appName is set', async () => {
      // Remove appName
      (client as any).appName = undefined;

      (axios.post as jest.Mock).mockResolvedValue({
        data: {
          choices: [
            {
              message: { content: 'content' },
            },
          ],
        },
      });

      await client.chatCompletion(model, messages);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'X-Title': expect.anything(),
          }),
        })
      );
    });
  });
});

jest.resetAllMocks();
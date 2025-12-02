import axios from 'axios';
import { OpenRouterClient } from './OpenRouterClient.js';
import { LLMMessage } from '../models/LLMMessage.js';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenRouterClient Integration Tests', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OpenRouterClient();
  });

  it('should successfully call /chat/completions endpoint and return content', async () => {
    const model = 'gpt-4o-mini';
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Hello' }
    ];

    const mockResponse = {
      data: {
        choices: [
          { message: { content: 'Hello from OpenRouter' } }
        ]
      }
    };

    mockedAxios.post.mockResolvedValueOnce(mockResponse);

    const result = await client.chatCompletion(model, messages);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      { model, messages },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
          'Content-Type': 'application/json',
          'X-Title': 'testbot1'
        }),
        timeout: 60000,
      })
    );
    expect(typeof result).toBe('string');
    expect(result).toBe('Hello from OpenRouter');
  });

  it('should throw error if no content returned in response', async () => {
    const model = 'gpt-4o-mini';
    const messages: LLMMessage[] = [{ role: 'user', content: 'Anything' }];

    mockedAxios.post.mockResolvedValueOnce({ data: { choices: [{}] } });

    await expect(client.chatCompletion(model, messages))
      .rejects
      .toThrow('No content in OpenRouter response');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('should handle axios error with response status and data', async () => {
    const model = 'gpt-4o-mini';
    const messages: LLMMessage[] = [{ role: 'user', content: 'Test error' }];

    const axiosError = {
      isAxiosError: true,
      response: {
        status: 429,
        data: { message: 'Rate limit exceeded' }
      },
      toJSON: () => ({}),
      message: 'Request failed',
      config: {},
      name: 'AxiosError',
      stack: '',
      code: '429',
    };

    mockedAxios.post.mockRejectedValueOnce(axiosError);

    await expect(client.chatCompletion(model, messages))
      .rejects
      .toThrow(/OpenRouter error: 429/);
  });

  it('should throw generic error if non-axios error is thrown', async () => {
    const model = 'gpt-4o-mini';
    const messages: LLMMessage[] = [{ role: 'user', content: 'some message' }];

    const genericError = new Error('Some generic error');
    mockedAxios.post.mockRejectedValueOnce(genericError);

    await expect(client.chatCompletion(model, messages))
      .rejects
      .toThrow('Some generic error');
  });

  it('should throw error immediately if apiKey is missing', async () => {
    // Create a client instance with apiKey undefined forcibly
    const clientWithoutKey = new OpenRouterClient();
    (clientWithoutKey as any).apiKey = '';

    await expect(clientWithoutKey.chatCompletion('model', []))
      .rejects.toThrow('Missing OPENROUTER_API_KEY');
  });

  it('should include X-Title header only if appName is set', async () => {
    const model = 'gpt-4o-mini';
    const messages: LLMMessage[] = [{ role: 'user', content: 'test' }];

    const clientWithoutAppName = new OpenRouterClient();
    (clientWithoutAppName as any).appName = undefined;

    mockedAxios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'response' } }] }
    });

    const result = await clientWithoutAppName.chatCompletion(model, messages);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'X-Title': expect.any(String)
        })
      }),
    );

    expect(result).toBe('response');
  });
});
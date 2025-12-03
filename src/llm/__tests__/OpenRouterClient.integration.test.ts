// @ts-nocheck
import axios from 'axios';
import { OpenRouterClient } from '../OpenRouterClient';
import { LLMMessage } from '../../models/LLMMessage';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenRouterClient Integration Tests', () => {
  const validModel = 'gpt-4o-mini';
  const sampleMessages: LLMMessage[] = [
    { role: 'user', content: 'Hello, world!' },
  ];
  let client: OpenRouterClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new OpenRouterClient();
  });

  it('should send a valid request and return the content from response', async () => {
    const mockContent = 'Hello from OpenRouter!';
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: mockContent,
            },
          },
        ],
      },
    });

    const result = await client.chatCompletion(validModel, sampleMessages);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(`${client['baseUrl']}/chat/completions`),
      {
        model: validModel,
        messages: sampleMessages,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining(client['apiKey']),
          'Content-Type': 'application/json',
          'X-Title': client['appName'],
        }),
        timeout: 60000,
      }),
    );

    expect(result).toBe(mockContent);
  });

  it('should throw error if response contains no content', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        choices: [{ message: {} }],
      },
    });

    await expect(client.chatCompletion(validModel, sampleMessages)).rejects.toThrow(
      'No content in OpenRouter response',
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('should throw error if axios throws a client error with response', async () => {
    const errorResponse = {
      response: {
        status: 403,
        data: { error: 'Forbidden' },
      },
      isAxiosError: true,
      toJSON: () => ({}),
    };
    mockedAxios.post.mockRejectedValueOnce(errorResponse);

    await expect(client.chatCompletion(validModel, sampleMessages)).rejects.toThrow(
      /OpenRouter error: 403/,
    );
  });

  it('should throw error if axios throws a network error without response', async () => {
    const networkError = {
      isAxiosError: true,
      toJSON: () => ({}),
      response: undefined,
      message: 'Network Error',
    };
    mockedAxios.post.mockRejectedValueOnce(networkError);

    await expect(client.chatCompletion(validModel, sampleMessages)).rejects.toThrow();
  });

  it('should throw original error if non-Axios error occurs', async () => {
    const someError = new Error('Unexpected failure');
    mockedAxios.post.mockRejectedValueOnce(someError);

    await expect(client.chatCompletion(validModel, sampleMessages)).rejects.toThrow('Unexpected failure');
  });
});
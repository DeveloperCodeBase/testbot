import axios from 'axios';
import { LLMMessage } from '../models/LLMMessage.js';
import logger from '../utils/logger.js';

export class OpenRouterClient {
    private apiKey: string;
    private baseUrl: string;
    private appName?: string;

    constructor() {
        this.apiKey = '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';
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.appName = 'testbot1';

        if (!this.apiKey) {
            logger.warn('Missing OPENROUTER_API_KEY environment variable');
        }
    }

    async chatCompletion(model: string, messages: LLMMessage[]): Promise<string> {
        if (!this.apiKey) {
            throw new Error('Missing OPENROUTER_API_KEY');
        }

        try {
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            };

            if (this.appName) {
                headers['X-Title'] = this.appName;
            }

            // Use HTTP-Referer if you have a site URL, for now we can skip or use a placeholder
            // headers['HTTP-Referer'] = 'https://github.com/your-repo/testbot'; 

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model,
                    messages,
                },
                {
                    headers,
                    timeout: 60000, // 60s timeout
                }
            );

            const content = response.data?.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No content in OpenRouter response');
            }
            return content as string;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const data = JSON.stringify(error.response?.data);
                throw new Error(`OpenRouter error: ${status} ${data}`);
            }
            throw error;
        }
    }
}

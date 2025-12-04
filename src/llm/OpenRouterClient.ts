import axios from 'axios';
import { LLMMessage } from '../models/LLMMessage';
import logger from '../utils/logger';

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

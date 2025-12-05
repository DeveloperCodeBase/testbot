import axios from 'axios';
import { LLMMessage } from '../models/LLMMessage';
import logger from '../utils/logger';

export enum LLMErrorCategory {
    AUTH_ERROR = 'AUTH_ERROR',
    RATE_LIMIT = 'RATE_LIMIT',
    MODEL_ERROR = 'MODEL_ERROR',
    SERVER_ERROR = 'SERVER_ERROR',
    UNKNOWN = 'UNKNOWN',
}

export class LLMError extends Error {
    constructor(
        public message: string,
        public category: LLMErrorCategory,
        public modelId: string,
        public task?: string,
        public rawMessage?: string,
        public suggestedRemediation?: string
    ) {
        super(message);
        this.name = 'LLMError';
    }
}

export class OpenRouterClient {
    private apiKey: string;
    private baseUrl: string;
    private appName?: string;
    private fallbackModel: string;

    constructor(apiKey: string, baseUrl?: string, appName?: string, fallbackModel?: string) {
        this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
        this.baseUrl = baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
        this.appName = appName || process.env.OPENROUTER_APP_NAME || 'ai-testbot';
        this.fallbackModel = fallbackModel || process.env.OPENROUTER_MODEL || '';

        if (!this.apiKey) {
            logger.warn('Missing OPENROUTER_API_KEY - OpenRouterClient initialized without API key');
        }
        if (!this.fallbackModel) {
            logger.warn('Missing OPENROUTER_MODEL - Fallback model not configured');
        }
    }

    async chatCompletion(model: string, messages: LLMMessage[], task?: string): Promise<string> {
        if (!this.apiKey) {
            throw new LLMError(
                'Missing OPENROUTER_API_KEY',
                LLMErrorCategory.AUTH_ERROR,
                model,
                task,
                undefined,
                'Please set OPENROUTER_API_KEY in your .env file.'
            );
        }

        // Try with primary model
        try {
            return await this.makeRequest(model, messages, task);
        } catch (error) {
            if (error instanceof LLMError) {
                // Check if we should fallback
                if (error.category === LLMErrorCategory.MODEL_ERROR || error.category === LLMErrorCategory.RATE_LIMIT) {
                    if (this.fallbackModel && model !== this.fallbackModel) {
                        logger.warn(`Primary model ${model} failed (${error.category}). Attempting fallback to ${this.fallbackModel}`);
                        try {
                            return await this.makeRequest(this.fallbackModel, messages, task);
                        } catch (fallbackError) {
                            logger.error(`Fallback model ${this.fallbackModel} also failed`);
                            throw fallbackError;
                        }
                    }
                }
            }
            throw error;
        }
    }

    private async makeRequest(model: string, messages: LLMMessage[], task?: string): Promise<string> {
        return this.retryWithBackoff(async () => {
            try {
                const headers: Record<string, string> = {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                };

                if (this.appName) {
                    headers['X-Title'] = this.appName;
                }

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
                    throw new LLMError(
                        'No content in OpenRouter response',
                        LLMErrorCategory.SERVER_ERROR,
                        model,
                        task
                    );
                }
                return content as string;
            } catch (error) {
                this.handleAxiosError(error, model, task);
                throw error; // Should not be reached if handleAxiosError throws
            }
        }, model);
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, model: string): Promise<T> {
        const maxRetries = 3;
        let attempt = 0;

        while (true) {
            try {
                return await fn();
            } catch (error) {
                attempt++;
                if (attempt > maxRetries || !(error instanceof LLMError) || error.category !== LLMErrorCategory.RATE_LIMIT) {
                    throw error;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                logger.warn(`Rate limit hit for ${model}. Retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    private handleAxiosError(error: unknown, model: string, task?: string): never {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const data = error.response?.data;
            const rawMessage = JSON.stringify(data);
            const errorMessage = data?.error?.message || error.message;

            let category = LLMErrorCategory.UNKNOWN;
            let remediation = '';

            if (status === 401 || status === 403 || errorMessage.includes('User not found')) {
                category = LLMErrorCategory.AUTH_ERROR;
                remediation = 'Check your OPENROUTER_API_KEY in .env or environment.';
            } else if (status === 429 || errorMessage.includes('rate-limited') || errorMessage.includes('Rate limit')) {
                category = LLMErrorCategory.RATE_LIMIT;
                remediation = 'Wait a moment or check your plan limits.';
                if (model.endsWith(':free')) {
                    remediation += ' Consider upgrading to a paid model (remove :free suffix).';
                }
            } else if (status === 404 || errorMessage.includes('No endpoints found')) {
                category = LLMErrorCategory.MODEL_ERROR;
                remediation = `Model ${model} not available. Check your .env model IDs or use the fallback model.`;
            } else if (status && status >= 500) {
                category = LLMErrorCategory.SERVER_ERROR;
                remediation = 'OpenRouter upstream error. Try again later.';
            }

            throw new LLMError(
                `OpenRouter error: ${status} - ${errorMessage}`,
                category,
                model,
                task,
                rawMessage,
                remediation
            );
        }

        throw new LLMError(
            `Unknown error: ${error instanceof Error ? error.message : String(error)}`,
            LLMErrorCategory.UNKNOWN,
            model,
            task
        );
    }
}

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
    private secondaryFallbackModel: string;
    private modelCache: Map<string, boolean> = new Map(); // Cache for validated models
    private lastModelUsed: string = ''; // Track final model used for reporting
    private fallbackEvents: Array<{ model: string; reason: string; timestamp: string }> = [];

    constructor(apiKey: string, baseUrl?: string, appName?: string, fallbackModel?: string) {
        this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
        this.baseUrl = baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
        this.appName = appName || process.env.OPENROUTER_APP_NAME || 'ai-testbot';
        this.fallbackModel = fallbackModel || process.env.OPENROUTER_MODEL || '';
        this.secondaryFallbackModel = process.env.OPENROUTER_MODEL_FALLBACK || 'meta-llama/llama-3.1-8b-instruct';

        if (!this.apiKey) {
            logger.warn('Missing OPENROUTER_API_KEY - OpenRouterClient initialized without API key');
        }
        if (!this.fallbackModel) {
            logger.warn('Missing OPENROUTER_MODEL - Fallback model not configured');
        }
    }

    /**
     * Get the last model that was successfully used
     * Useful for reporting which model actually completed the request
     */
    getLastModelUsed(): string {
        return this.lastModelUsed;
    }

    /**
     * Get recorded fallback events
     */
    getFallbackEvents(): Array<{ model: string; reason: string; timestamp: string }> {
        return this.fallbackEvents;
    }

    /**
     * Validate if a model exists and is available via OpenRouter
     * Uses caching to avoid repeated API calls
     */
    async validateModel(modelId: string): Promise<boolean> {
        // Check cache first
        if (this.modelCache.has(modelId)) {
            return this.modelCache.get(modelId)!;
        }

        // Reject free models explicitly
        if (modelId.endsWith(':free')) {
            logger.warn(`Model ${modelId} is a free model and may have rate limits. Consider using paid alternatives.`);
            this.modelCache.set(modelId, false);
            return false;
        }

        try {
            // Try a minimal completion request to validate the model
            // This is more reliable than /models endpoint which may not list all models
            const testResponse = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: modelId,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );

            const isValid = testResponse.status === 200;
            this.modelCache.set(modelId, isValid);
            logger.info(`Model ${modelId} validated: ${isValid}`);
            return isValid;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                if (status === 404 || status === 400) {
                    logger.warn(`Model ${modelId} not found or invalid`);
                    this.modelCache.set(modelId, false);
                    return false;
                }
            }
            // For other errors (rate limits, network), don't cache and assume valid
            logger.warn(`Could not validate model ${modelId}: ${error}`);
            return true; // Optimistically allow it
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
            const result = await this.makeRequest(model, messages, task);
            this.lastModelUsed = model;
            return result;
        } catch (error) {
            if (error instanceof LLMError) {
                // Check if we should fallback
                if (error.category === LLMErrorCategory.MODEL_ERROR || error.category === LLMErrorCategory.RATE_LIMIT) {
                    // Try primary fallback
                    if (this.fallbackModel && model !== this.fallbackModel) {
                        logger.warn(`Primary model ${model} failed (${error.category}). Attempting fallback to ${this.fallbackModel}`);
                        this.fallbackEvents.push({
                            model: this.fallbackModel,
                            reason: `Primary model ${model} failed: ${error.message}`,
                            timestamp: new Date().toISOString()
                        });
                        try {
                            const result = await this.makeRequest(this.fallbackModel, messages, task);
                            this.lastModelUsed = this.fallbackModel;
                            return result;
                        } catch (fallbackError) {
                            logger.error(`Fallback model ${this.fallbackModel} also failed`);

                            // Try secondary fallback as last resort
                            if (this.secondaryFallbackModel &&
                                this.fallbackModel !== this.secondaryFallbackModel &&
                                model !== this.secondaryFallbackModel) {
                                logger.warn(`Attempting secondary fallback to ${this.secondaryFallbackModel}`);
                                this.fallbackEvents.push({
                                    model: this.secondaryFallbackModel,
                                    reason: `Primary and fallback models failed. Primary: ${model}, Fallback: ${this.fallbackModel}`,
                                    timestamp: new Date().toISOString()
                                });
                                try {
                                    const result = await this.makeRequest(this.secondaryFallbackModel, messages, task);
                                    this.lastModelUsed = this.secondaryFallbackModel;
                                    return result;
                                } catch (secondaryError) {
                                    logger.error(`Secondary fallback ${this.secondaryFallbackModel} also failed`);
                                    throw secondaryError;
                                }
                            }

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

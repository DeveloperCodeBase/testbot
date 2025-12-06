import axios from 'axios';
import logger from '../utils/logger';
import { BotConfig } from '../config/schema';
import { OpenRouterClient } from './OpenRouterClient';

export type LLMTask = 'plan' | 'generate' | 'heal' | 'analyze' | 'transform';

export interface LLMCallOptions {
    temperature?: number;
    maxTokens?: number;
    forceModel?: string;
}

export interface LLMUsageStats {
    model: string;
    task: LLMTask;
    tokensEstimated: number;
    timestamp: string;
}

export interface LLMRequest {
    role: 'unit' | 'integration' | 'e2e' | 'fix';
    additionalInstructions?: string;
    language: string;
    framework?: string;
    testFramework: string;
    files: { path: string; content: string }[];
    projectSummary: string;
    architectureSummary?: string;
    extraContext?: string;
    failingOutput?: string;
}

export interface LLMResponse {
    generatedFiles: { [filePath: string]: string };
}

/**
 * Orchestrates LLM interactions for test generation
 */
export class LLMOrchestrator {
    private config: BotConfig['llm'];
    private openRouterClient: OpenRouterClient;
    private usageStats: LLMUsageStats[] = [];
    private totalTokensUsed: number = 0;

    constructor(config: BotConfig['llm']) {
        this.config = config;
        this.openRouterClient = new OpenRouterClient(config.api_key || '', undefined, undefined, config.model);
    }

    /**
     * Call LLM with task-based model routing
     */
    async callLLMWithRouting(task: LLMTask, prompt: string, options?: LLMCallOptions): Promise<string> {
        // 1. Select model based on task and mode
        const model = this.selectModel(task, prompt, options);

        // 2. Estimate tokens
        const estimatedTokens = this.estimateTokens(prompt);

        // 3. Check token budget
        if (!this.checkTokenBudget(estimatedTokens)) {
            const msg = `Token budget exceeded: ${this.totalTokensUsed + estimatedTokens} > ${this.config.max_tokens_per_run}`;
            logger.warn(msg);
            throw new Error(msg);
        }

        // 4. Make the call
        try {
            const result = await this.callOpenRouter(prompt, model, task);
            this.recordUsage(model, task, estimatedTokens);
            return result;
        } catch (error) {
            logger.error(`LLM call failed for task ${task} using model ${model}: ${error}`);
            throw error;
        }
    }

    /**
     * Select model based on task type and context
     */
    private selectModel(task: LLMTask, prompt: string, options?: LLMCallOptions): string {
        if (options?.forceModel) {
            return options.forceModel;
        }

        const mode = this.config.mode || 'balanced';
        const models = this.config.models;

        // If not in balanced mode, use default model
        if (mode !== 'balanced' || !models) {
            return this.config.model;
        }

        const estimatedTokens = this.estimateTokens(prompt);

        // Long context detection
        if (estimatedTokens > 100000 && models.long_context) {
            logger.info(`Using long-context model for ${estimatedTokens} tokens`);
            return models.long_context;
        }

        // Task-based routing
        switch (task) {
            case 'plan':
                return models.planner || this.config.model;
            case 'generate':
            case 'heal':
                return models.coder || this.config.model;
            case 'analyze':
            case 'transform':
                return models.helper || this.config.model;
            default:
                return this.config.model;
        }
    }

    /**
     * Estimate token count for a prompt
     */
    private estimateTokens(prompt: string): number {
        // Rough estimation: ~4 chars per token for English text
        return Math.ceil(prompt.length / 4);
    }

    /**
     * Check if we're within token budget
     */
    private checkTokenBudget(estimatedTokens: number): boolean {
        const maxTokens = this.config.max_tokens_per_run || Infinity;
        const threshold = this.config.token_budget_warn_threshold || 0.8;

        if (this.totalTokensUsed + estimatedTokens > maxTokens * threshold) {
            logger.warn(`Approaching token budget: ${this.totalTokensUsed + estimatedTokens}/${maxTokens} (${Math.round(((this.totalTokensUsed + estimatedTokens) / maxTokens) * 100)}%)`);
        }

        return this.totalTokensUsed + estimatedTokens <= maxTokens;
    }

    /**
     * Record usage statistics
     */
    private recordUsage(model: string, task: LLMTask, tokensEstimated: number): void {
        this.usageStats.push({
            model,
            task,
            tokensEstimated,
            timestamp: new Date().toISOString(),
        });
        this.totalTokensUsed += tokensEstimated;
        logger.debug(`LLM usage: ${task} with ${model}, ~${tokensEstimated} tokens (total: ${this.totalTokensUsed})`);
    }

    /**
     * Get usage statistics
     */
    getUsageStats(): LLMUsageStats[] {
        return this.usageStats;
    }

    /**
     * Get total tokens used
     */
    getTotalTokensUsed(): number {
        return this.totalTokensUsed;
    }

    /**
     * Get fallback events
     */
    getFallbackEvents() {
        return this.openRouterClient.getFallbackEvents();
    }

    /**
     * Generate tests using LLM
     */
    async generateTests(request: LLMRequest): Promise<LLMResponse> {
        const prompt = this.buildPrompt(request, request.additionalInstructions);

        logger.info(`Generating ${request.role} tests for ${request.language} project`);

        try {
            const response = await this.callLLMWithRouting('generate', prompt);
            const generatedFiles = this.parseResponse(response);

            return { generatedFiles };
        } catch (error) {
            logger.error(`Failed to generate tests: ${error}`);
            throw error;
        }
    }

    /**
     * Fix failing tests using LLM
     */
    async fixTests(request: LLMRequest): Promise<LLMResponse> {
        if (!request.failingOutput) {
            throw new Error('failingOutput is required for fix requests');
        }

        const prompt = this.buildFixPrompt(request);

        logger.info(`Fixing failing tests for ${request.language} project`);

        try {
            const response = await this.callLLMWithRouting('heal', prompt);
            const generatedFiles = this.parseResponse(response);

            return { generatedFiles };
        } catch (error) {
            logger.error(`Failed to fix tests: ${error}`);
            throw error;
        }
    }

    /**
     * Build prompt for test generation
     */
    private buildPrompt(request: LLMRequest, additionalInstructions?: string): string {
        const { role, language, framework, testFramework, files, projectSummary, architectureSummary, extraContext } = request;

        let prompt = `You are an expert test engineer generating ${role} tests for a ${language} project.

Project Summary:
${projectSummary}

${framework ? `Framework: ${framework}` : ''}
Test Framework: ${testFramework}

${architectureSummary ? `Architecture:\n${architectureSummary}\n` : ''}
${extraContext ? `Additional Context:\n${extraContext}\n` : ''}

Source Files:
`;

        for (const file of files) {
            prompt += `\nFile: ${file.path}\n\`\`\`${language}\n${file.content}\n\`\`\`\n`;
        }

        prompt += `\n\nGenerate comprehensive ${testFramework} ${role} tests for the above code. Follow these guidelines:

1. For UNIT tests: Test all functions, methods, and edge cases with mocks for dependencies
2. For INTEGRATION tests: Test API endpoints, service interactions, and database operations
3. For E2E tests: Test complete user workflows end-to-end

Requirements:
- Use ${testFramework} syntax and best practices
- Include proper setup and teardown
- Add meaningful assertions
- Cover edge cases and error scenarios
- Use appropriate mocking strategies
- Follow ${language} conventions

${(framework === 'react' && testFramework === 'vitest') ? `
CRITICAL MOCKING STANDARDS:
- Use 'vi.mock' for external modules.
- For 'react-router-dom', use this canonical pattern to avoid "Cannot redefine property" errors:
  \`\`\`typescript
  vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
      ...actual,
      useNavigate: () => vi.fn(),
      useLocation: () => ({ pathname: '/' }),
      useParams: () => ({}),
    };
  });
  \`\`\`
- Always use 'vi.importActual' when mocking partial modules.
` : ''}

${additionalInstructions ? `\nADDITIONAL INSTRUCTIONS:\n${additionalInstructions}\n` : ''}

Return ONLY the test code in a single code block with the filename as a comment at the top.
Format:
\`\`\`${language}
// filename: path/to/test/file${language === 'typescript' ? '.ts' : language === 'javascript' ? '.js' : language === 'python' ? '.py' : '.java'}
<test code>
\`\`\`

If generating multiple test files, separate them with a line containing only "---".`;

        return prompt;
    }

    /**
     * Build prompt for fixing tests
     */
    private buildFixPrompt(request: LLMRequest): string {
        const { language, testFramework, files, failingOutput } = request;

        let prompt = `You are an expert test engineer fixing failing ${language} tests.

Test Framework: ${testFramework}

Failing Test Output:
\`\`\`
${failingOutput}
\`\`\`

Test Files:
`;

        for (const file of files) {
            prompt += `\nFile: ${file.path}\n\`\`\`${language}\n${file.content}\n\`\`\`\n`;
        }

        prompt += `\n\nAnalyze the failing tests and fix them. Common issues to check:
- Incorrect assertions or expected values
- Missing mocks or stubs
- Async/await issues
- Incorrect test setup/teardown
- Type mismatches

Return ONLY the fixed test code in the same format as the original, with the filename as a comment at the top.`;

        return prompt;
    }

    /**
     * Call LLM API (legacy method, prefer callLLMWithRouting)
     * @deprecated Use callLLMWithRouting for task-based model routing
     */
    // @ts-expect-error - kept for backward compatibility
    private async callLLM(prompt: string): Promise<string> {
        const { provider, model, api_key } = this.config;

        if (provider === 'openai') {
            return await this.callOpenAI(prompt, model, api_key || process.env.OPENAI_API_KEY || '');
        } else if (provider === 'claude') {
            return await this.callClaude(prompt, model, api_key || process.env.ANTHROPIC_API_KEY || '');
        } else if (provider === 'gemini') {
            return await this.callGemini(prompt, model, api_key || process.env.GOOGLE_API_KEY || '');
        } else if (provider === 'openrouter') {
            return await this.callOpenRouter(prompt, model, 'generate');
        }

        throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    /**
     * Call OpenAI API
     */
    private async callOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: this.config.timeout,
            }
        );

        return response.data.choices[0].message.content;
    }

    /**
     * Call Anthropic Claude API
     */
    private async callClaude(prompt: string, model: string, apiKey: string): Promise<string> {
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: this.config.max_tokens,
                temperature: this.config.temperature,
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                },
                timeout: this.config.timeout,
            }
        );

        return response.data.content[0].text;
    }

    /**
     * Call Google Gemini API
     */
    private async callGemini(prompt: string, model: string, apiKey: string): Promise<string> {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: this.config.temperature,
                    maxOutputTokens: this.config.max_tokens,
                },
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: this.config.timeout,
            }
        );

        return response.data.candidates[0].content.parts[0].text;
    }

    /**
     * Call OpenRouter API
     */
    private async callOpenRouter(prompt: string, model: string, task: string): Promise<string> {
        return await this.openRouterClient.chatCompletion(model, [
            {
                role: 'user',
                content: prompt,
            },
        ], task);
    }

    /**
     * Parse LLM response to extract generated files
     */
    private parseResponse(response: string): { [filePath: string]: string } {
        const files: { [filePath: string]: string } = {};

        // Split by --- to handle multiple files
        const sections = response.split('\n---\n');

        for (const section of sections) {
            // Extract code blocks
            const codeBlockRegex = /```(?:typescript|javascript|python|java|ts|js|py)?\n\/\/\s*filename:\s*(.+?)\n([\s\S]+?)```/g;
            let match;

            while ((match = codeBlockRegex.exec(section)) !== null) {
                const filename = match[1].trim();
                const code = match[2].trim();
                files[filename] = code;
            }

            // Fallback: try to extract without filename comment
            if (Object.keys(files).length === 0) {
                const simpleCodeBlockRegex = /```(?:typescript|javascript|python|java|ts|js|py)?\n([\s\S]+?)```/;
                const simpleMatch = section.match(simpleCodeBlockRegex);
                if (simpleMatch) {
                    files['generated_test'] = simpleMatch[1].trim();
                }
            }
        }

        return files;
    }
}

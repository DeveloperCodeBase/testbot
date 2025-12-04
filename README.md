# Autonomous Multi-Language AI Test Bot

An autonomous test bot that analyzes repositories, generates comprehensive tests across multiple languages and frameworks, executes them, and iteratively refines them based on coverage and failure analysis—all without human intervention.

## Features

- 🤖 **Fully Autonomous**: No human intervention required during execution
- 💰 **Cost-Optimized**: Intelligent multi-model routing keeps costs <$0.20/run
- 🌐 **Multi-Language Support**: Node.js/TypeScript, Python, Java (with .NET, Go, PHP coming soon)
- 🧪 **Comprehensive Testing**: Generates unit, integration, and E2E tests
- 📊 **Coverage-Driven**: Iteratively improves tests based on coverage analysis
- 🔄 **Self-Healing**: Automatically fixes failing tests using AI
- 🎯 **Framework Detection**: Automatically detects and adapts to your tech stack
- 📝 **Rich Reports**: JSON and HTML reports with detailed metrics and LLM usage stats

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Basic Usage

```bash
# Analyze a repository
npx testbot analyze <repo-url-or-path>

# With options
npx testbot analyze ./my-project --coverage-threshold 85 --output ./results
```

### Configuration

Create a `.ai-test-bot.yml` file in your repository or use the global config:

```yaml
enabled_tests:
  unit: true
  integration: true
  e2e: true

coverage:
  threshold: 80
  max_refinement_iterations: 3

llm:
  provider: "openrouter"
  mode: "balanced"  # balanced | cheap | premium
  models:
    planner: "nousresearch/hermes-3-llama-3.1-405b"
    coder: "google/gemini-2.0-flash-exp:free"
    long_context: "google/gemini-2.0-flash-exp:free"
    helper: "meta-llama/llama-3.2-3b-instruct:free"
  max_tokens_per_run: 1000000
```

## LLM Configuration (Cost-Optimized Multi-Model Strategy)

This project uses OpenRouter with an intelligent **balanced multi-model strategy** to minimize costs while maintaining high-quality test generation.

### 🎯 Balanced Mode (Recommended)

The testbot automatically routes tasks to appropriate models:

- **Planning & Strategy** → Hermes 405B (strong reasoning)
- **Code Generation** → Gemini Flash (fast, capable, **FREE!**)
- **Test Healing** → Gemini Flash (fast, capable, **FREE!**)
- **Analysis & Transforms** → Llama 3.2 3B (quick, **FREE!**)
- **Long Context (>100k tokens)** → Auto-detected, uses appropriate model

**Cost Profile:**
- 90%+ of operations use **free models**
- Only complex planning uses premium models
- **Estimated cost: <$0.20 per run** (vs $2-5 with GPT-4 only)

### Setup

1. **Sign up at https://openrouter.ai** and get your API key
2. **Create a `.env` file** in the project root:

```env
# Required
OPENROUTER_API_KEY=your_api_key_here

# Balanced Mode (default, recommended)
LLM_MODE=balanced
LLM_MODEL_PLANNER=nousresearch/hermes-3-llama-3.1-405b
LLM_MODEL_CODER=google/gemini-2.0-flash-exp:free
LLM_MODEL_LONG_CONTEXT=google/gemini-2.0-flash-exp:free
LLM_MODEL_HELPER=meta-llama/llama-3.2-3b-instruct:free

# Token Budget
LLM_MAX_TOKENS_PER_RUN=1000000
LLM_TOKEN_WARN_THRESHOLD=0.8
```

### Alternative Modes

**Cheap Mode** (all free):
```env
LLM_MODE=cheap
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

**Premium Mode** (maximum quality):
```env
LLM_MODE=premium
OPENROUTER_MODEL=openai/gpt-4o
```

### Usage Monitoring

Every HTML report includes a **🤖 LLM Usage Statistics** section showing:
- Total tokens used
- Model-by-model breakdown with call counts
- Task-type breakdown (generate, heal, plan, analyze)
- Cost implications

## Architecture

The bot is organized into modular components:

- **Orchestrator**: Manages the execution pipeline
- **Repo Manager**: Handles Git operations and workspace management
- **Stack Detector**: Identifies languages, frameworks, and architecture
- **Language Adapters**: Language-specific test generation and execution
- **LLM Orchestrator**: Manages AI interactions for test generation
- **Test Generators**: Unit, integration, and E2E test creation
- **Execution Engine**: Runs tests and collects results
- **Coverage Analyzer**: Parses coverage reports and guides refinement
- **Report Generator**: Creates comprehensive test reports

## Supported Languages & Frameworks

### Node.js/TypeScript
- Express, NestJS, Next.js, React
- Jest, Mocha, Vitest
- Supertest, Playwright, Cypress

### Python
- Django, FastAPI, Flask
- pytest, unittest
- FastAPI TestClient, Django Test Client

### Java
- Spring Boot
- JUnit, TestNG
- MockMvc, TestRestTemplate

## CLI Commands

```bash
# Analyze and generate tests
testbot analyze <repo-url-or-path> [options]

Options:
  --config <path>          Custom config file
  --output <dir>           Output directory
  --no-unit                Skip unit tests
  --no-integration         Skip integration tests
  --no-e2e                 Skip E2E tests
  --coverage-threshold     Coverage target (default: 80)
  --git-push               Push to remote branch
  --verbose                Detailed logging
```

## Environment Variables

```bash
# OpenRouter (required)
OPENROUTER_API_KEY=your-api-key-here

# LLM Mode Configuration
LLM_MODE=balanced  # balanced | cheap | premium

# Task-Specific Models (for balanced mode)
LLM_MODEL_PLANNER=nousresearch/hermes-3-llama-3.1-405b
LLM_MODEL_CODER=google/gemini-2.0-flash-exp:free
LLM_MODEL_LONG_CONTEXT=google/gemini-2.0-flash-exp:free
LLM_MODEL_HELPER=meta-llama/llama-3.2-3b-instruct:free

# Token Budget
LLM_MAX_TOKENS_PER_RUN=1000000
LLM_TOKEN_WARN_THRESHOLD=0.8
```

## Output

The bot generates:

- **JSON Report**: Machine-readable results at `<output>/results.json`
  - Includes `llmUsage` field with token counts and model breakdown
- **HTML Report**: Visual report at `<output>/results.html`
  - Includes interactive LLM Usage Statistics section
- **Coverage Data**: Per-project coverage reports
- **Test Files**: Generated tests in your repository
- **Logs**: Detailed execution logs

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run with TypeScript directly
npm run dev

# Build
npm run build
```

## License

MIT

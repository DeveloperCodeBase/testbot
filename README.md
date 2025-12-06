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

```

## LLM Configuration (Stable Paid Models)

This project uses OpenRouter with **stable, paid models** for reliable operation without rate limits.

### 🎯 Recommended Configuration

The testbot uses task-specific models for optimal cost/quality:

- **Planning & Strategy** → Claude 3.5 Sonnet (best reasoning)
- **Code Generation** → Qwen 2.5 Coder 32B (excellent code quality, low cost)
- **Test Healing** → Qwen 2.5 Coder 32B (fast iterations)
- **Long Context (>100k tokens)** → Llama 3.3 70B (efficient for large codebases)

**Cost Profile:**
- **Estimated cost: $0.20-1.00 per run**
- No rate limits or availability issues
- Consistent, predictable performance

### Setup

1. **Sign up at https://openrouter.ai** and get your API key
2. **Create a `.env` file** in the project root:

```env
# Required
OPENROUTER_API_KEY=your_api_key_here

# Recommended stable paid models
LLM_MODE=balanced
LLM_MODEL_PLANNER=anthropic/claude-3.5-sonnet
LLM_MODEL_CODER=qwen/qwen-2.5-coder-32b-instruct
LLM_MODEL_LONG_CONTEXT=meta-llama/llama-3.3-70b-instruct
LLM_MODEL_HELPER=qwen/qwen-2.5-coder-32b-instruct

# Primary fallback
OPENROUTER_MODEL=qwen/qwen-2.5-coder-32b-instruct

# Secondary fallback (if primary fails)
OPENROUTER_MODEL_FALLBACK=meta-llama/llama-3.1-8b-instruct

# Token Budget
LLM_MAX_TOKENS_PER_RUN=250000
LLM_TOKEN_WARN_THRESHOLD=0.8
```

3. **Run the bot**:
```bash
npm install
npm run build
npm run self-check  # Validates the bot on itself
```

### Environment auto-loading (no manual `source .env`)

The CLI and programmatic entrypoints now eagerly load environment variables from multiple locations so you never need to run
`set -a; source .env` manually. The loader checks, in order:

1. The target repository path you pass to `analyze` (e.g., `~/code/my-service/.env`)
2. The current working directory
3. The packaged root (`./.env` next to the compiled binaries)
4. A user-level override: `~/.testbot.env`

If `OPENROUTER_API_KEY` is still missing after scanning these paths, the CLI exits with a remediation message that lists every
location it attempted so you can quickly drop the key in the right place.

### Alternative: Premium Mode

For maximum quality (higher cost ~$2-5/run):
```env
LLM_MODE=premium
OPENROUTER_MODEL=openai/gpt-4o
```

### Usage Monitoring

Every HTML report includes a **🤖 LLM Usage Statistics** section showing:
- Total tokens used
- Model-by-model breakdown with call counts
- Task-type breakdown (generate, heal, plan, analyze)
- **Final model used** (after any fallbacks)
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

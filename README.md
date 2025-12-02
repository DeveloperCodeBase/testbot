# Autonomous Multi-Language AI Test Bot

An autonomous test bot that analyzes repositories, generates comprehensive tests across multiple languages and frameworks, executes them, and iteratively refines them based on coverage and failure analysis—all without human intervention.

## Features

- 🤖 **Fully Autonomous**: No human intervention required during execution
- 🌐 **Multi-Language Support**: Node.js/TypeScript, Python, Java (with .NET, Go, PHP coming soon)
- 🧪 **Comprehensive Testing**: Generates unit, integration, and E2E tests
- 📊 **Coverage-Driven**: Iteratively improves tests based on coverage analysis
- 🔄 **Self-Healing**: Automatically fixes failing tests using AI
- 🎯 **Framework Detection**: Automatically detects and adapts to your tech stack
- 📝 **Rich Reports**: JSON and HTML reports with detailed metrics

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

llm:
  provider: "openai"
  model: "gpt-4"
  # Set OPENAI_API_KEY environment variable
```

## LLM Configuration (OpenRouter)

This project uses OpenRouter as the LLM provider.

1. Sign up at https://openrouter.ai and get your API key.
2. Create a `.env` file in the root of the project:
   ```env
   OPENROUTER_API_KEY=your_api_key_here
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   OPENROUTER_MODEL=openai/gpt-4.1-mini
   OPENROUTER_APP_NAME=ai-testbot
   ```

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
OPENAI_API_KEY=your-api-key-here
ANTHROPIC_API_KEY=your-api-key-here
GOOGLE_API_KEY=your-api-key-here
```

## Output

The bot generates:

- **JSON Report**: Machine-readable results at `<output>/results.json`
- **HTML Report**: Visual report at `<output>/results.html`
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

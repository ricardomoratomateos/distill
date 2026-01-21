# Contributing to Distill

Thanks for your interest in contributing! This guide will help you get started.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Adding Features](#adding-features)

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- API keys for testing (Anthropic and/or OpenAI)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/distill.git
cd distill

# Install dependencies
pnpm install

# Build all packages (uses Turborepo)
pnpm build

# Set up environment
cp .env.example .env
# Add your API keys to .env
```

### Build System

This project uses **pnpm workspaces** + **Turborepo**:

- **pnpm**: Fast, disk-efficient package manager with workspace support
- **Turborepo**: Build orchestration with intelligent caching and parallelization

```bash
pnpm build      # Build all packages (cached)
pnpm dev        # Watch mode for all packages
pnpm test       # Run tests in parallel
pnpm lint       # Lint all packages
pnpm typecheck  # TypeScript type checking
pnpm clean      # Clean dist/, .turbo/, node_modules/
```

Turborepo caches task outputs in `.turbo/`. Second builds are near-instant:

```
First build:  Tasks: 3 successful | Time: 1.5s
Second build: Tasks: 3 cached    | Time: 52ms >>> FULL TURBO
```

### Environment Variables

```bash
# Required for running tests with real APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: LangSmith for tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=distill-dev
```

### Verify Setup

```bash
# Run the test suite
pnpm test

# Try the CLI
pnpm --filter @distill/cli start --help
```

---

## Project Structure

```
distill/
├── packages/
│   ├── core/                 # Main library
│   │   ├── src/
│   │   │   ├── types/        # Shared types and schemas
│   │   │   ├── profiler/     # Captures agent behavior
│   │   │   ├── judge/        # LLM-based evaluation
│   │   │   ├── modifier/     # Prompt optimization
│   │   │   ├── agents/       # Agent abstractions
│   │   │   ├── validator/    # End-to-end testing
│   │   │   ├── config/       # YAML config loader
│   │   │   └── index.ts      # Public exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                  # Command-line interface
│   │   ├── src/
│   │   │   ├── commands/     # profile, migrate, evaluate
│   │   │   └── index.ts      # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                  # Dashboard (placeholder)
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── examples/                 # Example agents and configs
├── docs/                     # Documentation
├── turbo.json                # Turborepo task configuration
├── pnpm-workspace.yaml       # Workspace configuration
├── tsconfig.base.json        # Shared TypeScript config
└── package.json              # Root scripts
```

### Package Dependencies

```
@distill/cli
    └── @distill/core
            ├── @langchain/core
            ├── @langchain/anthropic
            ├── @langchain/openai
            ├── langsmith
            └── zod
```

---

## Running Tests

### Unit Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @distill/core test

# Run tests in watch mode
pnpm --filter @distill/core test:watch

# Run a specific test file
pnpm --filter @distill/core test src/judge/judge.test.ts
```

### Test Structure

```
packages/core/src/
├── judge/
│   ├── index.ts          # Implementation
│   └── judge.test.ts     # Tests
├── profiler/
│   ├── index.ts
│   └── profiler.test.ts
└── ...
```

### Writing Tests

```typescript
// packages/core/src/judge/judge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Judge } from './index.js';

describe('Judge', () => {
  it('should evaluate semantic equivalence', async () => {
    const judge = new Judge({
      model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      threshold: 0.8,
    });

    const result = await judge.evaluate(
      'test-1',
      'What is 2+2?',
      'The answer is 4.',
      'Four.'
    );

    expect(result.score).toBeGreaterThan(0.8);
    expect(result.passed).toBe(true);
  });
});
```

### Mocking LLM Calls

For unit tests, mock the LLM responses:

```typescript
import { vi } from 'vitest';

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({ score: 0.9, feedback: 'Good match' }),
    }),
  })),
}));
```

### Integration Tests

Integration tests use recorded traces (no real API calls):

```bash
# Run integration tests
pnpm test:integration

# Record new traces (requires API keys)
pnpm test:record
```

### End-to-End Tests

E2E tests make real API calls (expensive, run in CI):

```bash
# Run E2E tests (requires API keys)
pnpm test:e2e
```

---

## Making Changes

### Branch Naming

```
feature/add-mistral-support
fix/judge-parsing-error
docs/update-examples
refactor/simplify-modifier
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add support for custom judge criteria
fix(cli): handle missing config file gracefully
docs: update migration example
test(judge): add tests for edge cases
refactor(modifier): simplify prompt generation
```

### Development Workflow

```bash
# Create a feature branch
git checkout -b feature/my-feature

# Make changes
# ...

# Run tests
pnpm test

# Run linting
pnpm lint

# Check types (without building)
pnpm typecheck

# Build (also checks types)
pnpm build

# Commit changes
git add .
git commit -m "feat(core): add new feature"

# Push and create PR
git push origin feature/my-feature
```

---

## Pull Request Process

### Before Submitting

1. **Tests pass**: `pnpm test`
2. **Lint passes**: `pnpm lint`
3. **Types check**: `pnpm typecheck`
4. **Build succeeds**: `pnpm build`
5. **Documentation updated** (if needed)

### PR Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe how you tested the changes.

## Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Lint passes
- [ ] Types check
- [ ] Build succeeds
```

### Review Process

1. Create PR against `main`
2. Automated checks run (tests, lint, build)
3. Maintainer reviews code
4. Address feedback
5. Maintainer merges

---

## Code Style

### TypeScript

- Use strict mode (`strict: true` in tsconfig)
- Explicit return types on public functions
- Prefer `interface` over `type` for objects
- Use Zod for runtime validation

```typescript
// Good
interface JudgeConfig {
  model: ModelConfig;
  threshold: number;
}

export function createJudge(config: JudgeConfig): Judge {
  return new Judge(config);
}

// Avoid
type JudgeConfig = {
  model: ModelConfig;
  threshold: number;
};
```

### File Organization

```typescript
// 1. Imports (external first, then internal)
import { z } from 'zod';
import type { ModelConfig } from '../types.js';

// 2. Types/Interfaces
export interface JudgeConfig {
  // ...
}

// 3. Constants
const DEFAULT_THRESHOLD = 0.8;

// 4. Main class/functions
export class Judge {
  // ...
}

// 5. Helper functions (private)
function parseResponse(content: string): JudgeResponse {
  // ...
}
```

### Error Handling

```typescript
// Use custom error classes
export class JudgeError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'JudgeError';
  }
}

// Throw with context
throw new JudgeError(
  'Failed to parse judge response',
  'PARSE_ERROR',
  { response: content }
);
```

### Async/Await

```typescript
// Good
async function evaluate(): Promise<EvaluationResult> {
  const response = await model.invoke(messages);
  return parseResponse(response);
}

// Avoid
function evaluate(): Promise<EvaluationResult> {
  return model.invoke(messages).then(parseResponse);
}
```

---

## Adding Features

### Adding a New Provider

1. Create provider adapter in `packages/core/src/providers/`:

```typescript
// packages/core/src/providers/mistral.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export function createMistralModel(config: ModelConfig): BaseChatModel {
  // Implementation
}
```

2. Register in model factory:

```typescript
// packages/core/src/agents/index.ts
import { createMistralModel } from '../providers/mistral.js';

function createModel(config: ModelConfig): BaseChatModel {
  switch (config.provider) {
    case 'anthropic':
      return new ChatAnthropic(/* ... */);
    case 'openai':
      return new ChatOpenAI(/* ... */);
    case 'mistral':
      return createMistralModel(config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

3. Add tests
4. Update documentation

### Adding a CLI Command

1. Create command file:

```typescript
// packages/cli/src/commands/analyze.ts
import { Command } from 'commander';

export const analyzeCommand = new Command('analyze')
  .description('Analyze agent workload patterns')
  .requiredOption('-c, --config <file>', 'Agent config file')
  .action(async (options) => {
    // Implementation
  });
```

2. Register in CLI:

```typescript
// packages/cli/src/index.ts
import { analyzeCommand } from './commands/analyze.js';

program.addCommand(analyzeCommand);
```

3. Add tests and documentation

### Adding a Modifier Strategy

1. Implement the Modifier interface:

```typescript
// packages/core/src/modifier/few-shot-modifier.ts
import type { Modifier, Modification } from './types.js';

export class FewShotModifier implements Modifier {
  async analyze(profile: ProfileData, evaluations: EvaluationResult[]) {
    // Analyze failures
  }

  async propose(analysis: Analysis): Promise<Modification> {
    // Generate few-shot examples to add
  }

  async apply(agent: Agent, modification: Modification): Promise<Agent> {
    // Apply to agent
  }
}
```

2. Add to modifier factory
3. Add tests
4. Document when to use this strategy

---

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Join our Discord for real-time chat

Thank you for contributing!

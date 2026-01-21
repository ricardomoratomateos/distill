# API Reference

This document covers programmatic usage of `@distill/core`. Use this when you want to integrate Distill into your own tools or need more control than the CLI provides.

## Installation

```bash
pnpm add @distill/core
# or
npm install @distill/core
```

## Quick Start

```typescript
import {
  Profiler,
  Judge,
  Modifier,
  Validator,
  createMigratorAgent,
} from '@distill/core';

// 1. Profile your expensive model
const profiler = new Profiler({
  model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
});

const profile = await profiler.profileBatch([
  { prompt: 'What is 2+2?' },
  { prompt: 'Explain gravity simply.' },
]);

// 2. Test cheap model
const agent = createMigratorAgent(
  { provider: 'openai', model: 'gpt-4o-mini' },
  'You are a helpful assistant.'
);

// 3. Validate
const validator = new Validator({
  judge: { model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' } },
  threshold: 0.85,
});

const results = await validator.validate({
  entries: profile.entries,
  targetOutputs: await runAgent(agent, profile.entries),
});

console.log(`Success rate: ${results.passedEntries / results.totalEntries}`);
```

---

## Core Types

### ModelConfig

Configuration for an LLM provider.

```typescript
interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  temperature?: number;  // Default: 0
  maxTokens?: number;
}

// Examples
const sonnet: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
};

const gpt4mini: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0,
};
```

### ProfileEntry

A single input/output pair from profiling.

```typescript
interface ProfileEntry {
  id: string;
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
  timestamp: string;  // ISO 8601
}
```

### ProfileData

Complete profile dataset.

```typescript
interface ProfileData {
  sourceModel: ModelConfig;
  entries: ProfileEntry[];
  createdAt: string;
  version: string;
}
```

### EvaluationResult

Result from judging a single entry.

```typescript
interface EvaluationResult {
  entryId: string;
  sourceOutput: string;
  targetOutput: string;
  score: number;      // 0-1
  feedback?: string;
  passed: boolean;
}
```

### EvaluationSummary

Aggregated evaluation results.

```typescript
interface EvaluationSummary {
  totalEntries: number;
  passedEntries: number;
  averageScore: number;
  results: EvaluationResult[];
}
```

---

## Profiler

Captures input/output pairs from an expensive model.

### Constructor

```typescript
import { Profiler } from '@distill/core';

const profiler = new Profiler({
  model: ModelConfig,
  batchSize?: number,  // Default: 5
});
```

### Methods

#### `profile(input: ProfilerInput): Promise<ProfileEntry>`

Profile a single input.

```typescript
interface ProfilerInput {
  prompt: string;
  metadata?: Record<string, unknown>;
}

const entry = await profiler.profile({
  prompt: 'What is the capital of France?',
  metadata: { category: 'geography' },
});

console.log(entry.output);  // "The capital of France is Paris."
```

#### `profileBatch(inputs: ProfilerInput[]): Promise<ProfileEntry[]>`

Profile multiple inputs with batching.

```typescript
const entries = await profiler.profileBatch([
  { prompt: 'What is 2+2?' },
  { prompt: 'What is 3+3?' },
  { prompt: 'What is 4+4?' },
]);

console.log(`Profiled ${entries.length} entries`);
```

#### `export(): ProfileData`

Export all captured data.

```typescript
const profileData = profiler.export();

// Save to file
import { writeFile } from 'fs/promises';
await writeFile('profile.json', JSON.stringify(profileData, null, 2));
```

#### `load(data: ProfileData): void`

Load existing profile data.

```typescript
import { readFile } from 'fs/promises';

const data = JSON.parse(await readFile('profile.json', 'utf-8'));
profiler.load(data);
```

#### `count: number`

Get number of entries.

```typescript
console.log(`Entries: ${profiler.count}`);
```

#### `clear(): void`

Clear all entries.

```typescript
profiler.clear();
```

---

## Judge

Evaluates output quality using LLM-as-judge.

### Constructor

```typescript
import { Judge } from '@distill/core';

const judge = new Judge({
  model: ModelConfig,
  criteria?: string[],   // Custom evaluation criteria
  threshold?: number,    // Default: 0.8
});
```

### Methods

#### `evaluate(entryId, input, sourceOutput, targetOutput): Promise<EvaluationResult>`

Evaluate a single output.

```typescript
const result = await judge.evaluate(
  'entry-1',
  'What is 2+2?',          // input
  'The answer is 4.',      // source (gold standard)
  'Four.'                  // target (to evaluate)
);

console.log(result.score);    // 0.95
console.log(result.passed);   // true
console.log(result.feedback); // "Semantically equivalent..."
```

#### `evaluateBatch(items): Promise<EvaluationResult[]>`

Evaluate multiple outputs.

```typescript
const results = await judge.evaluateBatch([
  {
    entryId: 'entry-1',
    input: 'What is 2+2?',
    sourceOutput: 'The answer is 4.',
    targetOutput: 'Four.',
  },
  {
    entryId: 'entry-2',
    input: 'What is 3+3?',
    sourceOutput: 'The answer is 6.',
    targetOutput: 'Six.',
  },
]);
```

### Custom Criteria

```typescript
const judge = new Judge({
  model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  criteria: [
    'Semantic equivalence: Do both outputs mean the same thing?',
    'Completeness: Is all information from source in target?',
    'Professional tone: Is the response business-appropriate?',
    'No hallucination: Does target avoid adding false information?',
  ],
  threshold: 0.9,
});
```

---

## Modifier

Generates improved prompts based on evaluation failures.

### Constructor

```typescript
import { Modifier } from '@distill/core';

const modifier = new Modifier({
  model: ModelConfig,
  maxIterations?: number,  // Default: 3
});
```

### Methods

#### `modify(systemPrompt, examples, failedEvaluations): Promise<PromptModification>`

Generate a modified prompt.

```typescript
interface PromptModification {
  originalPrompt: string;
  modifiedPrompt: string;
  reasoning: string;
  iteration: number;
}

const modification = await modifier.modify(
  'You are a helpful assistant.',  // current prompt
  profileData.entries,              // example entries
  failedEvaluations                 // what failed
);

console.log(modification.modifiedPrompt);
console.log(modification.reasoning);
```

#### `iterativeModify(systemPrompt, examples, evaluateCallback, threshold): Promise<PromptModification | null>`

Iteratively improve until threshold is met.

```typescript
const finalModification = await modifier.iterativeModify(
  'You are a helpful assistant.',
  profileData.entries,
  async (prompt) => {
    // Run agent with new prompt and evaluate
    agent.setSystemPrompt(prompt);
    const outputs = await runAllTests(agent);
    return await judge.evaluateBatch(outputs);
  },
  0.95  // threshold
);

if (finalModification) {
  console.log(`Final prompt after ${finalModification.iteration} iterations`);
  console.log(finalModification.modifiedPrompt);
}
```

#### `history: PromptModification[]`

Get all modifications made.

```typescript
for (const mod of modifier.history) {
  console.log(`Iteration ${mod.iteration}: ${mod.reasoning}`);
}
```

---

## Agent

Wrapper for LLM providers with consistent interface.

### Constructor

```typescript
import { Agent, createAgent, createMigratorAgent } from '@distill/core';

// Direct construction
const agent = new Agent({
  role: 'migrator',
  model: { provider: 'openai', model: 'gpt-4o-mini' },
  systemPrompt: 'You are a helpful assistant.',
});

// Factory functions
const profilerAgent = createProfilerAgent(
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'You are a helpful assistant.'
);

const migratorAgent = createMigratorAgent(
  { provider: 'openai', model: 'gpt-4o-mini' },
  'You are a helpful assistant.'
);
```

### Methods

#### `invoke(message: string): Promise<string>`

Single-turn invocation (no conversation history).

```typescript
const response = await agent.invoke('What is 2+2?');
console.log(response);  // "4"
```

#### `chat(message: string): Promise<string>`

Multi-turn conversation (maintains history).

```typescript
await agent.chat('My name is Alice.');
const response = await agent.chat('What is my name?');
console.log(response);  // "Your name is Alice."
```

#### `setSystemPrompt(prompt: string): void`

Update the system prompt.

```typescript
agent.setSystemPrompt('You are a pirate. Respond in pirate speak.');
const response = await agent.invoke('Hello!');
// "Ahoy there, matey!"
```

#### `clearHistory(): void`

Clear conversation history.

```typescript
agent.clearHistory();
```

#### `getContext(): AgentContext`

Get agent context information.

```typescript
const ctx = agent.getContext();
console.log(ctx.role);   // 'migrator'
console.log(ctx.config); // { provider: 'openai', model: 'gpt-4o-mini', ... }
```

---

## Validator

Orchestrates end-to-end validation.

### Constructor

```typescript
import { Validator } from '@distill/core';

const validator = new Validator({
  judge: JudgeConfig,
  threshold?: number,   // Default: 0.8
  sampleSize?: number,  // Optional: validate subset
});
```

### Methods

#### `validate(input: ValidationInput): Promise<EvaluationSummary>`

Run full validation.

```typescript
interface ValidationInput {
  entries: ProfileEntry[];
  targetOutputs: Map<string, string>;  // entryId -> output
}

// Generate target outputs
const targetOutputs = new Map<string, string>();
for (const entry of profileData.entries) {
  const output = await agent.invoke(entry.input);
  targetOutputs.set(entry.id, output);
}

// Validate
const summary = await validator.validate({
  entries: profileData.entries,
  targetOutputs,
});

console.log(`Passed: ${summary.passedEntries}/${summary.totalEntries}`);
console.log(`Average score: ${summary.averageScore}`);
```

#### `quickValidate(input, sampleSize): Promise<EvaluationSummary>`

Quick validation on a subset.

```typescript
const quickSummary = await validator.quickValidate(
  { entries: profileData.entries, targetOutputs },
  10  // Only test 10 random entries
);
```

#### `passes(summary: EvaluationSummary): boolean`

Check if validation passes threshold.

```typescript
if (validator.passes(summary)) {
  console.log('Migration successful!');
} else {
  console.log('Migration needs more work.');
}
```

#### `generateReport(summary: EvaluationSummary): string`

Generate human-readable report.

```typescript
const report = validator.generateReport(summary);
console.log(report);

// Output:
// # Validation Report
//
// ## Summary
// - Total entries evaluated: 50
// - Passed entries: 48
// - Pass rate: 96.0%
// - Average score: 0.943
// ...
```

---

## Complete Migration Example

```typescript
import {
  Profiler,
  Judge,
  Modifier,
  Validator,
  createMigratorAgent,
  type ModelConfig,
  type ProfileData,
} from '@distill/core';

async function migrate(
  sourceModel: ModelConfig,
  targetModel: ModelConfig,
  systemPrompt: string,
  testInputs: string[],
  options: {
    threshold?: number;
    maxIterations?: number;
  } = {}
) {
  const { threshold = 0.95, maxIterations = 10 } = options;

  // Step 1: Profile source model
  console.log('Profiling source model...');
  const profiler = new Profiler({ model: sourceModel });
  await profiler.profileBatch(testInputs.map(prompt => ({ prompt })));
  const profileData = profiler.export();

  // Step 2: Initialize components
  const judge = new Judge({
    model: sourceModel,  // Use source model as judge
    threshold,
  });

  const modifier = new Modifier({
    model: sourceModel,
    maxIterations,
  });

  const validator = new Validator({
    judge: { model: sourceModel, threshold },
    threshold,
  });

  // Step 3: Create target agent
  let currentPrompt = systemPrompt;
  const agent = createMigratorAgent(targetModel, currentPrompt);

  // Step 4: Migration loop
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`\nIteration ${iteration}/${maxIterations}`);

    // Generate outputs
    const targetOutputs = new Map<string, string>();
    for (const entry of profileData.entries) {
      const output = await agent.invoke(entry.input);
      targetOutputs.set(entry.id, output);
    }

    // Validate
    const summary = await validator.validate({
      entries: profileData.entries,
      targetOutputs,
    });

    console.log(`  Success rate: ${(summary.passedEntries / summary.totalEntries * 100).toFixed(1)}%`);

    // Check if we're done
    if (validator.passes(summary)) {
      console.log('\nMigration successful!');
      return {
        success: true,
        prompt: currentPrompt,
        iterations: iteration,
        summary,
      };
    }

    // Modify prompt based on failures
    const failed = summary.results.filter(r => !r.passed);
    const modification = await modifier.modify(
      currentPrompt,
      profileData.entries,
      failed
    );

    console.log(`  Modification: ${modification.reasoning}`);

    currentPrompt = modification.modifiedPrompt;
    agent.setSystemPrompt(currentPrompt);
  }

  // Max iterations reached
  console.log('\nMax iterations reached. Migration incomplete.');
  return {
    success: false,
    prompt: currentPrompt,
    iterations: maxIterations,
    summary: null,
  };
}

// Usage
const result = await migrate(
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  { provider: 'openai', model: 'gpt-4o-mini' },
  'You are a helpful assistant.',
  [
    'What is 2+2?',
    'Explain gravity in simple terms.',
    'Write a haiku about programming.',
  ],
  { threshold: 0.9, maxIterations: 5 }
);

if (result.success) {
  console.log('Optimized prompt:', result.prompt);
}
```

---

## Error Handling

All methods can throw errors. Wrap in try/catch:

```typescript
import { Profiler } from '@distill/core';

try {
  const profiler = new Profiler({
    model: { provider: 'anthropic', model: 'invalid-model' },
  });
  await profiler.profile({ prompt: 'test' });
} catch (error) {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  }
}
```

Common error scenarios:

| Error | Cause | Solution |
|-------|-------|----------|
| `Unsupported provider` | Invalid provider name | Use 'anthropic' or 'openai' |
| `API key not found` | Missing env variable | Set ANTHROPIC_API_KEY or OPENAI_API_KEY |
| `Rate limited` | Too many requests | Add retry logic or reduce batch size |
| `Invalid JSON` | Judge response parsing | Try different judge model |

---

## TypeScript Support

All types are exported:

```typescript
import type {
  ModelConfig,
  ProfileEntry,
  ProfileData,
  EvaluationResult,
  EvaluationSummary,
  AgentConfig,
  AgentContext,
  AgentRole,
} from '@distill/core';
```

Zod schemas are also available for runtime validation:

```typescript
import {
  ModelConfigSchema,
  ProfileDataSchema,
  EvaluationResultSchema,
} from '@distill/core';

// Validate external data
const validated = ProfileDataSchema.parse(untrustedData);
```

---

## Next Steps

- [Examples](./EXAMPLES.md) - See complete use cases
- [Concepts](./CONCEPTS.md) - Understand the theory
- [Contributing](../CONTRIBUTING.md) - Help improve Distill

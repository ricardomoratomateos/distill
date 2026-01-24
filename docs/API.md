# API Reference

This document covers the programmatic API for Distill. For CLI usage, see [EXAMPLES.md](./EXAMPLES.md).

## Table of Contents

- [Core Components](#core-components)
  - [Profiler](#profiler)
  - [Judge](#judge)
  - [Modifier](#modifier)
  - [Validator](#validator)
  - [SingleAgent](#singleagent)
- [Convergence Strategies](#convergence-strategies)
- [Types](#types)

---

## Core Components

### Profiler

Creates gold standard test suites by executing an agent on test inputs.

```typescript
import { Profiler } from '@distill/core';

const profiler = new Profiler({
  agentConfig: AgentConfig,
  numExecutions?: number, // Default: 1
});

const testSuite = await profiler.profile(
  testInputs: Array<{ message: string }>
);
```

**Parameters:**
- `agentConfig` - Agent configuration (model, prompt, etc.)
- `numExecutions` - How many times to execute each test (for consistency)

**Returns:** `TestSuite` with gold standard outputs

**Example:**

```typescript
const profiler = new Profiler({
  agentConfig: {
    name: 'My Agent',
    model: {
      provider: 'anthropic',
      name: 'claude-sonnet-4-20250514',
      temperature: 0,
    },
    systemPrompt: 'You are a helpful assistant.',
    objective: 'Help users',
    successCriteria: ['Accurate'],
  },
});

const testSuite = await profiler.profile([
  { message: 'What is 2+2?' },
  { message: 'Explain gravity' },
]);
```

---

### Judge

LLM-as-Judge evaluation - compares agent outputs to gold standard.

```typescript
import { Judge } from '@distill/core';

const judge = new Judge({
  model: {
    provider: 'anthropic' | 'openai',
    name: string,
  },
  threshold?: number, // Default: 7/10
});

const results = await judge.evaluateBatch(
  testCases: TestCase[],
  actualOutputs: Map<string, string>
);
```

**Parameters:**
- `model` - Judge model config (usually use expensive, smart model)
- `threshold` - Minimum score to pass (0-10 scale)

**Returns:** `TestResult[]` with pass/fail and detailed evaluation

**Example:**

```typescript
const judge = new Judge({
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
  },
  threshold: 7,
});

const outputs = new Map([
  ['test-1', 'The answer is 4'],
  ['test-2', 'Gravity pulls objects toward each other'],
]);

const results = await judge.evaluateBatch(testSuite.testCases, outputs);

results.forEach(result => {
  console.log(`Test ${result.testCaseId}: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(`Score: ${result.evaluation.scores.correctness}/10`);
  console.log(`Reasoning: ${result.evaluation.reasoning}`);
});
```

---

### Modifier

Improves prompts based on test failures.

```typescript
import { Modifier } from '@distill/core';

const modifier = new Modifier({
  model: {
    provider: 'anthropic' | 'openai',
    name: string,
  },
});

const improvedPrompt = await modifier.modify(
  currentPrompt: string,
  failedTests: TestResult[],
  targetModelName: string
);
```

**Parameters:**
- `model` - Model for generating improved prompts
- `currentPrompt` - The prompt to improve
- `failedTests` - Failed test results with Judge feedback
- `targetModelName` - Target model name (for context)

**Returns:** Improved system prompt (string)

**Anti-Overfitting:**
The Modifier only sees abstract failure patterns (e.g., "response too long", "missing context"), not the specific test inputs/outputs. This prevents it from memorizing test cases.

**Example:**

```typescript
const modifier = new Modifier({
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
  },
});

const failedTests = results.filter(r => !r.passed);

const improved = await modifier.modify(
  'You are a helpful assistant.',
  failedTests,
  'gpt-4o-mini'
);

console.log(improved);
// "You are a helpful assistant. For simple questions, provide
//  direct answers. For complex topics, include context and examples."
```

---

### Validator

Orchestrates the full migration process using LangGraph.

```typescript
import { Validator, ThresholdPlusBonusRoundsStrategy } from '@distill/core';

const validator = new Validator({
  threshold?: number,           // Default: 0.95
  maxIterations?: number,       // Default: 10
  strategy?: ConvergenceStrategy, // Default: ThresholdPlusBonusRounds(2)
});

const result = await validator.migrate(
  sourceConfig: AgentConfig,
  targetConfig: AgentConfig,
  testSuite: TestSuite
);
```

**Parameters:**
- `threshold` - Success rate needed (0-1)
- `maxIterations` - Max optimization iterations
- `strategy` - Convergence strategy (see [Convergence Strategies](#convergence-strategies))

**Returns:** `MigrationResult`

```typescript
interface MigrationResult {
  success: boolean;           // Did we reach threshold?
  iterations: number;         // Iterations completed
  finalSuccessRate: number;   // Final success rate (0-1)
  finalPrompt: string;        // Optimized prompt
  originalPrompt: string;     // Original prompt
}
```

**Example:**

```typescript
const validator = new Validator({
  threshold: 0.75,
  maxIterations: 5,
  strategy: new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
});

const result = await validator.migrate(
  sourceConfig,  // Claude Sonnet config
  targetConfig,  // GPT-4o-mini config
  testSuite      // From profiler
);

if (result.success) {
  console.log(`Migration successful! Rate: ${result.finalSuccessRate}`);
  console.log(`Optimized prompt: ${result.finalPrompt}`);
} else {
  console.log(`Didn't fully converge. Best: ${result.finalSuccessRate}`);
}
```

---

### SingleAgent

Executes an agent with a given model and prompt.

```typescript
import { SingleAgent } from '@distill/core';

const agent = new SingleAgent(config: AgentConfig);

const output = await agent.execute(input: { message: string });
```

**Parameters:**
- `config` - Agent configuration

**Returns:** `{ response: string, cost: number, latency: number }`

**Example:**

```typescript
const agent = new SingleAgent({
  name: 'Test Agent',
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },
  systemPrompt: 'You are a math tutor.',
  objective: 'Help with math',
  successCriteria: ['Accurate'],
});

const output = await agent.execute({ message: 'What is 2+2?' });

console.log(output.response); // "2+2 equals 4"
console.log(output.cost);     // 0.0001
console.log(output.latency);  // 850
```

---

## Convergence Strategies

Strategies control when to stop the optimization loop.

### ThresholdPlusBonusRounds (Default)

Grants bonus iterations after reaching threshold.

```typescript
import { ThresholdPlusBonusRoundsStrategy } from '@distill/core';

const strategy = new ThresholdPlusBonusRoundsStrategy({
  bonusRounds: number, // Extra iterations after threshold
});
```

**Behavior:**
- Iterate until threshold is reached
- Grant N bonus rounds to explore improvements
- Return best result found

**Use when:** Balanced approach - not too expensive, room to improve

**Example:**

```typescript
new Validator({
  threshold: 0.75,
  maxIterations: 5,
  strategy: new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
});

// Iteration 1: 50% → keep going
// Iteration 2: 75% ✓ → threshold reached, activate bonus
// Iteration 3: 80% → bonus 1/2
// Iteration 4: 70% → bonus 2/2, stop
// Returns: iteration 3 (best: 80%)
```

---

### AlwaysRunMaxStrategy

Always runs all iterations.

```typescript
import { AlwaysRunMaxStrategy } from '@distill/core';

const strategy = new AlwaysRunMaxStrategy();
```

**Behavior:**
- Always run maxIterations
- Track best at each step
- Return the best found

**Use when:** Quality is critical, cost is secondary

**Example:**

```typescript
new Validator({
  threshold: 0.75,
  maxIterations: 5,
  strategy: new AlwaysRunMaxStrategy(),
});

// Runs all 5 iterations regardless
// Returns: best across all 5
```

---

### EarlyStoppingWithPatienceStrategy

Stops if no improvement for N iterations.

```typescript
import { EarlyStoppingWithPatienceStrategy } from '@distill/core';

const strategy = new EarlyStoppingWithPatienceStrategy({
  patience: number,              // Iterations without improvement
  minImprovement?: number,       // Default: 0.01 (1%)
});
```

**Behavior:**
- If success rate doesn't improve by `minImprovement` for `patience` iterations, stop
- Return best found so far

**Use when:** Minimize cost, acceptable to miss improvements

**Example:**

```typescript
new Validator({
  threshold: 0.75,
  maxIterations: 10,
  strategy: new EarlyStoppingWithPatienceStrategy({
    patience: 3,
    minImprovement: 0.05, // 5%
  }),
});

// Iteration 1: 50%
// Iteration 2: 75% (improved by 25%, reset patience)
// Iteration 3: 76% (improved by 1%, but < 5%, patience = 2)
// Iteration 4: 75% (no improvement, patience = 1)
// Iteration 5: 74% (no improvement, patience = 0, STOP)
// Returns: iteration 2 (best: 76%)
```

---

## Types

### AgentConfig

```typescript
interface AgentConfig {
  name: string;
  description?: string;

  model: {
    provider: 'anthropic' | 'openai';
    name: string;
    temperature?: number;
  };

  systemPrompt: string;

  objective: string;
  successCriteria: string[];
}
```

### TestSuite

```typescript
interface TestSuite {
  id: string;
  name: string;
  description?: string;
  testCases: TestCase[];
}

interface TestCase {
  id: string;
  description?: string;
  input: { message: string };
  expectedOutput?: { response: string };
}
```

### TestResult

```typescript
interface TestResult {
  testCaseId: string;
  passed: boolean;
  trace: {
    input: { message: string };
    output: { response: string };
  };
  actualOutput: { response: string };
  evaluation?: Evaluation;
}

interface Evaluation {
  scores: {
    correctness: number; // 0-10
  };
  reasoning: string;
  failures: string[];     // Issues found
  suggestions: string[];  // How to improve
}
```

---

## Complete Example

Full migration workflow programmatically:

```typescript
import {
  Profiler,
  Validator,
  ThresholdPlusBonusRoundsStrategy,
  type AgentConfig,
} from '@distill/core';

// 1. Define source agent (expensive)
const sourceConfig: AgentConfig = {
  name: 'Customer Support Bot',
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  systemPrompt: 'You are a helpful customer support agent.',
  objective: 'Help customers',
  successCriteria: ['Accurate', 'Friendly', 'Concise'],
};

// 2. Profile to create gold standard
const profiler = new Profiler({ agentConfig: sourceConfig });

const testSuite = await profiler.profile([
  { message: 'What is your return policy?' },
  { message: 'How do I reset my password?' },
  { message: 'What payment methods do you accept?' },
]);

console.log(`Created test suite with ${testSuite.testCases.length} cases`);

// 3. Define target agent (cheap)
const targetConfig: AgentConfig = {
  ...sourceConfig,
  name: 'Customer Support Bot (Optimized)',
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },
};

// 4. Migrate
const validator = new Validator({
  threshold: 0.75,
  maxIterations: 5,
  strategy: new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
});

const result = await validator.migrate(sourceConfig, targetConfig, testSuite);

// 5. Report results
console.log('\nMigration Results:');
console.log(`Success: ${result.success}`);
console.log(`Iterations: ${result.iterations}`);
console.log(`Final Rate: ${(result.finalSuccessRate * 100).toFixed(1)}%`);
console.log(`\nOptimized Prompt:\n${result.finalPrompt}`);

// 6. Save optimized config (optional)
import { saveAgentConfig } from '@distill/cli/utils/config';
await saveAgentConfig('agent.optimized.yaml', {
  ...targetConfig,
  systemPrompt: result.finalPrompt,
});
```

---

## Next Steps

- See [EXAMPLES.md](./EXAMPLES.md) for complete walkthrough
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- See [CONCEPTS.md](./CONCEPTS.md) for core ideas

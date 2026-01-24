# Examples

This guide walks through a complete migration using the current Distill MVP.

## Case Study: Customer Support Bot

### The Problem

You've built a customer support agent that works great with Claude Sonnet:
- Answers questions accurately
- Maintains professional tone
- Provides concise responses
- **Cost: $0.015 per interaction**

At 10,000 interactions/month, that's **$150/month**. With GPT-4o-mini, it could be **$1.50/month**.

But when you just swap the model, quality drops. The cheaper model:
- Gives overly long responses
- Misses the professional tone
- Sometimes includes irrelevant information

**With Distill: Automate the optimization.**

---

## Step 1: Define Your Agent

Create `agent.yaml`:

```yaml
name: "Customer Support Bot"
description: "Answers product questions accurately and concisely"

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0

systemPrompt: |
  You are a helpful customer support agent for TechCorp.
  Answer questions about our products accurately and concisely.
  Be professional and friendly.

objective: "Provide accurate, helpful answers to customer questions"

successCriteria:
  - "Answers are factually correct"
  - "Tone is professional and friendly"
  - "Responses are concise"
```

---

## Step 2: Create Test Inputs

Create `test-inputs.json` with representative questions:

```json
[
  "What is 2+2?",
  "What is the capital of France?",
  "Explain photosynthesis in one sentence.",
  "What is the Pythagorean theorem?"
]
```

**Tips for good test inputs:**
- Cover different complexity levels (simple, medium, complex)
- Include edge cases
- Representative of real usage
- 10-50 test cases for most agents

---

## Step 3: Profile Your Agent

Create the gold standard test suite:

```bash
node --env-file=.env packages/cli/dist/index.js profile \
  -c agent.yaml \
  -i test-inputs.json \
  -o test-suite.json
```

**Output:**
```
🔬 Profiling agent: Customer Support Bot
   Model: claude-sonnet-4-20250514
   Executing 4 test cases...
   [1/4] Executing...
      ✓ Cost: $0.0003, Latency: 2366ms
   [2/4] Executing...
      ✓ Cost: $0.0002, Latency: 1810ms
   [3/4] Executing...
      ✓ Cost: $0.0006, Latency: 1975ms
   [4/4] Executing...
      ✓ Cost: $0.0030, Latency: 3992ms
✅ Profiling complete: 4 test cases captured

Test Suite Created:
  ID: abc123...
  Name: Customer Support Bot - Gold Standard
  Test cases: 4
  Saved to: test-suite.json
```

The test suite now contains the "gold standard" outputs from Claude Sonnet.

---

## Step 4: Migrate to Cheaper Model

Run the migration with iterative optimization:

```bash
node --env-file=.env packages/cli/dist/index.js migrate \
  -c agent.yaml \
  -p test-suite.json \
  -t gpt-4o-mini \
  --threshold 0.75 \
  --max-iterations 5 \
  --strategy threshold-bonus \
  --bonus-rounds 2 \
  -o agent.optimized.yaml
```

**Options explained:**
- `-t gpt-4o-mini` - Target model to migrate to
- `--threshold 0.75` - Need 75% of tests passing
- `--max-iterations 5` - Max optimization rounds
- `--strategy threshold-bonus` - Use bonus rounds after reaching threshold
- `--bonus-rounds 2` - Grant 2 extra iterations after threshold

**Output:**
```
Migration Configuration:
  Source:     claude-sonnet-4-20250514
  Target:     gpt-4o-mini
  Threshold:  75%
  Max iters:  5
  Strategy:   threshold-bonus

🚀 Starting migration...

🔄 Iteration 1/5
   Testing current prompt...
   Evaluating with judge...
   Result: 2/4 passed (50.0%)
   Strategy decision: Seeking threshold (50.0% < 75.0%)
   Generating improved prompt...
   ✓ Prompt updated

🔄 Iteration 2/5
   Testing current prompt...
   Evaluating with judge...
   Result: 3/4 passed (75.0%)
   ✓ Threshold reached at iteration 2
   Granting 2 bonus rounds (requested 2, remaining 3)
   Strategy decision: Bonus round 1/2
   Generating improved prompt...
   ✓ Prompt updated

🔄 Iteration 3/5
   Testing current prompt...
   Evaluating with judge...
   Result: 2/4 passed (50.0%)
   Strategy decision: Bonus round 2/2
   Generating improved prompt...
   ✓ Prompt updated

🔄 Iteration 4/5
   Testing current prompt...
   Evaluating with judge...
   Result: 4/4 passed (100.0%)
   Strategy decision: Completed 2 bonus rounds after threshold

🏁 Migration complete!
   Best found: iteration 4 with 100.0%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Migration Results

✅ SUCCESS
Iterations: 4
Success Rate: 100.0%
Target: 75.0%

Prompt Evolution:
Original:
  "You are a helpful customer support agent for TechCorp..."
Optimized:
  "You are a helpful customer support agent for TechCorp.
   Answer questions with appropriate depth based on complexity.

   For simple questions: Provide direct, concise answers.
   For complex topics: Include definitions, examples, and context.

   Always maintain professional and friendly tone."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Optimized config saved to: agent.optimized.yaml
```

**What happened:**
1. Started with basic prompt
2. Iteration 1: 50% success → Modifier improves prompt
3. Iteration 2: 75% success → Threshold reached! Activate bonus rounds
4. Iteration 3: 50% success → Regressed (normal)
5. Iteration 4: 100% success → Best so far
6. **Returns iteration 4** (best), not iteration 5 (last)

---

## Step 5: Evaluate the Result

Test the optimized agent:

```bash
node --env-file=.env packages/cli/dist/index.js evaluate \
  -c agent.optimized.yaml \
  -p test-suite.json
```

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Evaluation Results

Agent: Customer Support Bot (Optimized)
Model: gpt-4o-mini
Test cases: 4
Passed: 3
Failed: 1
Pass rate: 75.0%

Failed Test Cases:

1. Test case 1: What is 2+2?...
   Score: 6/10
   Issues: Response too verbose for simple question
   Suggestions: Match response length to question complexity

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Evaluation needs improvement
```

---

## Understanding Convergence Strategies

Distill offers 3 strategies for deciding when to stop optimization:

### 1. ThresholdPlusBonusRounds (Default)

Gives extra iterations after reaching threshold:

```bash
--strategy threshold-bonus --bonus-rounds 2
```

**Behavior:**
- Iterate until threshold is reached
- Grant N bonus rounds to potentially improve further
- Return best result across all iterations

**Use when:** You want a balanced approach (not too expensive, but room to improve)

### 2. AlwaysRunMax

Always runs all iterations:

```bash
--strategy always-max
```

**Behavior:**
- Run all maxIterations regardless of success
- Track best at each step
- Return the best found

**Use when:** Quality is critical, cost is secondary

### 3. EarlyStoppingWithPatience

Stops early if no improvement:

```bash
--strategy early-stop --patience 3
```

**Behavior:**
- If no improvement for N iterations, stop
- Return best found so far

**Use when:** You want to minimize cost, acceptable to miss potential improvements

---

## Tips for Best Results

### Good Test Suites

✅ **Do:**
- 10-50 diverse test cases
- Cover edge cases
- Include different complexity levels
- Use real examples from production

❌ **Don't:**
- Too few tests (< 5) - won't generalize
- Too many similar tests - overfitting
- Synthetic/made-up data - won't match real usage

### Threshold Selection

- `0.50` (50%) - Very lenient, fast iterations
- `0.75` (75%) - **Recommended starting point**
- `0.90` (90%) - Strict, may need many iterations
- `0.95` (95%) - Very strict, expensive

**Start at 75%, adjust based on results.**

### Anti-Overfitting

Distill automatically prevents overfitting by:
1. **Modifier sees patterns, not answers** - Only sees failure types, not specific test cases
2. **General strategies** - Learns transferable approaches, not memorized answers
3. **Best result selection** - Returns best iteration, handles temporary regressions

---

## Programmatic Usage

You can also use Distill programmatically:

```typescript
import {
  Profiler,
  Validator,
  ThresholdPlusBonusRoundsStrategy,
  type AgentConfig,
} from '@distill/core';

// Define agent
const sourceConfig: AgentConfig = {
  name: 'My Agent',
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  systemPrompt: 'You are a helpful assistant.',
  objective: 'Help users',
  successCriteria: ['Accurate', 'Concise'],
};

// Profile
const profiler = new Profiler({ agentConfig: sourceConfig });
const testSuite = await profiler.profile([
  { message: 'Hello' },
  { message: 'What is 2+2?' },
]);

// Migrate
const targetConfig = {
  ...sourceConfig,
  model: { provider: 'openai', name: 'gpt-4o-mini', temperature: 0 },
};

const validator = new Validator({
  threshold: 0.75,
  maxIterations: 5,
  strategy: new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
});

const result = await validator.migrate(sourceConfig, targetConfig, testSuite);

console.log(`Success: ${result.success}`);
console.log(`Final rate: ${result.finalSuccessRate}`);
console.log(`Optimized prompt: ${result.finalPrompt}`);
```

---

## Next Steps

- See [API.md](./API.md) for full API reference
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- See [CONCEPTS.md](./CONCEPTS.md) for core concepts

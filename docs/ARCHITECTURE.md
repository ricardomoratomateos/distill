# Architecture

This document explains how Distill is designed, why certain decisions were made, and how the architecture enables evolution from Phase 1 (prompt optimization) to Phase 2 (multi-agent decomposition) without rewrites.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISTILL                                         │
│                                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │          │    │          │    │          │    │          │              │
│  │ Profiler │───▶│  Judge   │───▶│ Modifier │───▶│Validator │              │
│  │          │    │          │    │          │    │          │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │               │                     │
│       │               │               │               │                     │
│       ▼               ▼               ▼               ▼                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Agent Abstraction                            │   │
│  │                                                                      │   │
│  │   Phase 1: SingleAgent        Phase 2: MultiAgent                   │   │
│  │   ┌─────────────────┐         ┌─────────────────────────────────┐   │   │
│  │   │  LLM + Prompt   │         │  Router                          │   │   │
│  │   │  + Tools        │         │    ├─▶ SpecializedAgent1         │   │   │
│  │   └─────────────────┘         │    ├─▶ SpecializedAgent2         │   │   │
│  │                               │    └─▶ SpecializedAgent3         │   │   │
│  │                               └─────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │   Both implement the same Agent interface                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Agent Abstraction

The `Agent` interface is the foundation. Everything else operates on agents without knowing their internal structure.

```typescript
interface Agent {
  type: 'single' | 'multi';

  // Execute the agent with given input
  execute(input: AgentInput): Promise<AgentOutput>;

  // Get cost metrics
  getCost(): CostMetrics;

  // Get execution trace for debugging
  getTrace(): Trace;

  // Get current configuration (for serialization)
  getConfig(): AgentConfig;
}
```

**Why this matters:**

- Profiler calls `agent.execute()` - doesn't care if it's single or multi
- Validator calls `agent.execute()` - same interface
- Phase 2 is a drop-in replacement, not a rewrite

```typescript
// Phase 1
const agent = new SingleAgent(config);
const result = await profiler.run(agent);  // Works

// Phase 2 - SAME CODE
const agent = new MultiAgent(config);
const result = await profiler.run(agent);  // Also works
```

### 2. Profiler

Captures the behavior of an agent running on an expensive model. This becomes the "gold standard" for evaluation.

```
┌─────────────────────────────────────────────────────────────────┐
│                         PROFILER                                 │
│                                                                  │
│   Input Dataset        Agent (Source Model)        Profile Data  │
│   ┌───────────┐       ┌─────────────────┐       ┌────────────┐  │
│   │ prompt 1  │──────▶│                 │──────▶│ input      │  │
│   │ prompt 2  │──────▶│  Claude Sonnet  │──────▶│ output     │  │
│   │ prompt 3  │──────▶│                 │──────▶│ trace      │  │
│   │ ...       │       │                 │       │ cost       │  │
│   └───────────┘       └─────────────────┘       │ latency    │  │
│                                                  └────────────┘  │
│                                                                  │
│   Metrics: baseline cost, success rate, latency distribution     │
└─────────────────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Execute agent N times with diverse inputs
- Capture complete traces (inputs, outputs, tool calls, reasoning)
- Calculate baseline metrics
- Export to LangSmith for analysis

**Key design decision:** Profile data is model-agnostic. We store the behavior, not the model. This allows comparing any model against the gold standard.

### 3. Judge

Uses an LLM to evaluate if a target model's output meets the quality bar set by the source model.

```
┌─────────────────────────────────────────────────────────────────┐
│                           JUDGE                                  │
│                                                                  │
│   ┌─────────────┐     ┌─────────────────┐     ┌──────────────┐  │
│   │ Source      │     │                 │     │ Score: 0.85  │  │
│   │ Output      │────▶│   Judge LLM     │────▶│ Feedback:    │  │
│   │ (gold)      │     │   (evaluator)   │     │ "Missing X"  │  │
│   ├─────────────┤     │                 │     │ Passed: true │  │
│   │ Target      │────▶│                 │     └──────────────┘  │
│   │ Output      │     └─────────────────┘                       │
│   └─────────────┘                                               │
│                                                                  │
│   Evaluation dimensions:                                         │
│   • Correctness - Is the answer right?                          │
│   • Completeness - Is all information included?                 │
│   • Format - Does it match expected structure?                  │
│   • Reasoning - Is the logic sound?                             │
└─────────────────────────────────────────────────────────────────┘
```

**Why LLM-as-Judge instead of string matching?**

1. **Semantic equivalence**: "The capital is Paris" and "Paris is France's capital" are equivalent
2. **Partial credit**: 80% correct is better than 0%
3. **Explanations**: Judge tells you *why* something failed
4. **Domain flexibility**: Works for code, prose, structured data

**Judge configuration:**

```typescript
interface JudgeConfig {
  model: ModelConfig;           // Which LLM to use as judge
  criteria: EvaluationCriteria[]; // What to evaluate
  threshold: number;            // Pass/fail threshold (0-1)
  customPrompt?: string;        // Domain-specific instructions
}
```

### 4. Modifier

Analyzes failures and proposes improvements. This is where Phase 1 and Phase 2 diverge.

```
┌─────────────────────────────────────────────────────────────────┐
│                          MODIFIER                                │
│                                                                  │
│   Phase 1: PromptModifier                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │  Failed evaluations ──▶ Analyze patterns ──▶ New prompt │   │
│   │                                                          │   │
│   │  Strategies:                                             │   │
│   │  • Add explicit context                                  │   │
│   │  • Include few-shot examples                             │   │
│   │  • Add chain-of-thought instructions                     │   │
│   │  • Clarify output format                                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Phase 2: ArchitectureModifier                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │  Workload analysis ──▶ Cluster tasks ──▶ MultiAgent     │   │
│   │                                                          │   │
│   │  Output:                                                 │   │
│   │  • Router configuration                                  │   │
│   │  • N specialized agent configs                           │   │
│   │  • Orchestration code                                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Both modifiers implement the same interface:**

```typescript
interface Modifier {
  analyze(
    profile: ProfileData,
    evaluations: EvaluationResult[]
  ): Promise<Analysis>;

  propose(analysis: Analysis): Promise<Modification>;

  apply(
    agent: Agent,
    modification: Modification
  ): Promise<Agent>;
}
```

This allows the migration loop to work unchanged regardless of modification type.

### 5. Validator

Runs the complete test suite and determines if migration succeeded.

```
┌─────────────────────────────────────────────────────────────────┐
│                         VALIDATOR                                │
│                                                                  │
│   Profile Data          Modified Agent         Validation Report │
│   ┌────────────┐       ┌─────────────┐       ┌───────────────┐  │
│   │ 50 test    │       │             │       │ Success: 96%  │  │
│   │ cases      │──────▶│  Run all    │──────▶│ Failures: 2   │  │
│   │ (gold      │       │  tests      │       │ Avg score:    │  │
│   │ standard)  │       │             │       │   0.94        │  │
│   └────────────┘       └─────────────┘       │ Passed: ✓     │  │
│                                               └───────────────┘  │
│                                                                  │
│   Validation modes:                                              │
│   • Quick (10 samples) - fast iteration                         │
│   • Full (all samples) - final validation                       │
│   • Stress (with edge cases) - robustness testing               │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Migration Pipeline

```
                    ┌─────────────────────────────────────┐
                    │          Migration Graph            │
                    │          (LangGraph)                │
                    └─────────────────────────────────────┘
                                     │
     ┌───────────────────────────────┼───────────────────────────────┐
     │                               │                               │
     ▼                               ▼                               ▼
┌─────────┐                   ┌─────────────┐                 ┌───────────┐
│ Profile │                   │   Iterate   │                 │  Export   │
│ Source  │                   │   Until     │                 │  Result   │
│ Model   │                   │   Success   │                 │           │
└─────────┘                   └─────────────┘                 └───────────┘
     │                               │                               ▲
     │                               │                               │
     ▼                               ▼                               │
┌─────────────────────────────────────────────────────────────────────┘
│
│  Iteration Loop:
│
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  │ Run      │───▶│ Evaluate │───▶│ Analyze  │───▶│ Modify   │
│  │ Target   │    │ (Judge)  │    │ Failures │    │ Agent    │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘
│       ▲                                               │
│       │                                               │
│       └───────────────────────────────────────────────┘
│                    (repeat until success)
│
└─────────────────────────────────────────────────────────────────────
```

### State Management

```typescript
interface MigrationState {
  // Input
  sourceAgent: Agent;
  targetModel: ModelConfig;

  // Progress
  iteration: number;
  profile: ProfileData;
  currentAgent: Agent;

  // Results
  evaluations: EvaluationResult[];
  modifications: Modification[];

  // Output
  finalAgent: Agent | null;
  success: boolean;
}
```

LangGraph manages state transitions and enables:
- Checkpointing (resume interrupted migrations)
- Parallel evaluation runs
- Conditional branching (different strategies based on failure patterns)

## Design Decisions

### 1. Why separate Profiler and Judge?

**Alternative:** Single component that profiles and evaluates.

**Our choice:** Separate concerns because:
- Profiling happens once, judging happens many times
- Different optimization strategies (batch profiling vs streaming evaluation)
- Enables swapping judges without re-profiling
- Profile data is reusable across multiple migration attempts

### 2. Why LangGraph over custom orchestration?

**Alternative:** Simple while loop with manual state management.

**Our choice:** LangGraph because:
- Built-in checkpointing for long-running migrations
- Visualizable execution graph
- Easier to add parallel branches (Phase 2 will need this)
- Industry-standard for agent orchestration

### 3. Why YAML config over code-only?

**Alternative:** Define agents purely in TypeScript.

**Our choice:** YAML config + TypeScript because:
- Non-developers can read/modify agent specs
- Easy to version control and diff
- Enables future web UI configuration
- Code available for complex cases

### 4. Why monorepo with packages?

**Alternative:** Single package.

**Our choice:** Monorepo because:
- `core` is usable without CLI (library use case)
- `cli` can be installed globally
- `web` (future) shares types with `core`
- Clear dependency boundaries

## Scaling to Phase 2

The key insight: **everything operates on the Agent interface**.

### Phase 1 (Current)

```
SingleAgent
    │
    ├── execute(input) → Run LLM with prompt + tools
    ├── getCost() → Single model cost
    └── getConfig() → { model, prompt, tools }
```

### Phase 2 (Future)

```
MultiAgent
    │
    ├── execute(input) → Route to specialized agents
    │                    └── Aggregate results
    ├── getCost() → Sum of all sub-agent costs
    └── getConfig() → { router, agents: [...] }
```

**What doesn't change:**
- Profiler still calls `agent.execute()`
- Judge still compares outputs
- Validator still runs test suites
- CLI commands stay the same

**What's new:**
- `ArchitectureModifier` that outputs `MultiAgent` instead of modified `SingleAgent`
- `Analyzer` component that clusters workload types
- New configuration schemas for multi-agent

### Migration Path

```
Phase 1                              Phase 2
────────                             ────────

SingleAgent                          SingleAgent
    │                                    │
    ▼                                    ▼
PromptModifier                       Decision
    │                                 /     \
    ▼                                ▼       ▼
SingleAgent                    Prompt    Architecture
(optimized)                   Modifier    Modifier
                                  │           │
                                  ▼           ▼
                             SingleAgent   MultiAgent
                             (optimized)   (new arch)
```

The Validator works identically for both outputs.

## Package Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  @distill/cli                                                   │
│      │                                                          │
│      └──────────────▶ @distill/core                            │
│                            │                                    │
│                            ├──▶ @langchain/core                │
│                            ├──▶ @langchain/anthropic           │
│                            ├──▶ @langchain/openai              │
│                            ├──▶ @langchain/langgraph           │
│                            ├──▶ langsmith                      │
│                            └──▶ zod                            │
│                                                                  │
│  @distill/web (future)                                          │
│      │                                                          │
│      └──────────────▶ @distill/core                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling

```typescript
// Errors bubble up with context
class DistillError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public context: Record<string, unknown>
  ) {
    super(message);
  }
}

// Specific error types
class ProfileError extends DistillError { }
class EvaluationError extends DistillError { }
class ModificationError extends DistillError { }

// Example
throw new EvaluationError(
  'Judge failed to parse response',
  'JUDGE_PARSE_ERROR',
  { response, model: judge.model }
);
```

## Testing Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                         TEST PYRAMID                             │
│                                                                  │
│                        ┌─────────┐                              │
│                        │  E2E    │  Full migration flow         │
│                        │  Tests  │  (slow, few)                 │
│                       ─┴─────────┴─                             │
│                      ┌─────────────┐                            │
│                      │ Integration │  Component interactions    │
│                      │   Tests     │  (medium)                  │
│                     ─┴─────────────┴─                           │
│                    ┌─────────────────┐                          │
│                    │   Unit Tests    │  Individual functions    │
│                    │                 │  (fast, many)            │
│                   ─┴─────────────────┴─                         │
│                                                                  │
│  Mock strategy:                                                  │
│  • Unit: Mock LLM responses                                     │
│  • Integration: Use recorded traces                             │
│  • E2E: Real API calls (expensive, CI only)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Future Considerations

### Caching

Profile data and evaluation results can be cached:
- Avoid re-profiling unchanged agents
- Reuse evaluations when only modifier changes

### Parallelization

Evaluation runs are embarrassingly parallel:
- Run N test cases concurrently
- Aggregate results after all complete

### Streaming

For long-running migrations:
- Stream progress updates to CLI
- Enable web UI real-time updates

### Plugins

Extensibility points:
- Custom modifiers (domain-specific optimization strategies)
- Custom judges (specialized evaluation criteria)
- Custom providers (Mistral, Llama, etc.)

---

Next: [Concepts](./CONCEPTS.md) - Understanding the core ideas behind Distill

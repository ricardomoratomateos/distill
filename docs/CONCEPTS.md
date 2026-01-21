# Core Concepts

This document explains the fundamental ideas behind Distill. Understanding these concepts will help you use the tool effectively and troubleshoot issues.

## Table of Contents

- [The Model Capability Gap](#the-model-capability-gap)
- [Intelligent Downgrade](#intelligent-downgrade)
- [LLM-as-Judge](#llm-as-judge)
- [Iterative Prompt Refinement](#iterative-prompt-refinement)
- [Multi-Agent Decomposition](#multi-agent-decomposition)
- [Tradeoffs](#tradeoffs)

---

## The Model Capability Gap

### Why Cheap Models Fail

When you take a prompt that works on Claude Sonnet and run it on GPT-4o-mini, you often see degraded performance. This isn't because cheaper models are "bad"—they're remarkably capable. The problem is a **capability gap**.

```
                    Capability Spectrum

    ◄─────────────────────────────────────────────────────►

    GPT-4o-mini          Claude Haiku          Claude Sonnet
    Llama 3 8B           GPT-4o                GPT-4

    │                         │                         │
    │  Needs explicit         │  Some inference         │  Strong inference
    │  instructions           │  capability             │  from context
    │                         │                         │
    │  Struggles with         │  Handles some           │  Handles complex
    │  ambiguity              │  ambiguity              │  ambiguity
    │                         │                         │
    │  Benefits from          │  Can follow             │  Flexible with
    │  rigid structure        │  guidelines             │  instructions
```

### What Frontier Models Do Implicitly

Expensive models excel at:

1. **Inferring context**: "tomorrow" → specific date
2. **Handling ambiguity**: "book me a class" → asks clarifying questions
3. **Multi-step reasoning**: plans before acting
4. **Format flexibility**: produces consistent output without strict templates
5. **Error recovery**: recognizes and corrects mistakes mid-response

### What Cheap Models Need Explicitly

The same capabilities are available in cheaper models, but they need guidance:

| Frontier Model Does | Cheap Model Needs |
|---------------------|-------------------|
| Infers "tomorrow" = date + 1 | Explicit rule: "tomorrow means current date + 1 day" |
| Handles "tmrw" naturally | Examples: "tmrw = tomorrow, u = you" |
| Plans multi-step tasks | Step-by-step workflow: "1. Parse input 2. Check availability..." |
| Outputs consistent format | Template: "Always respond with: {status, message, ...}" |
| Self-corrects errors | `<think>` blocks for reasoning before acting |

**Key insight**: Cheap models are capable—they just need their instructions to be more explicit.

---

## Intelligent Downgrade

### The Naive Approach (Doesn't Work)

```
Prompt for Sonnet ──────► GPT-4o-mini ──────► 60% success
                                              (degraded)
```

Just swapping the model rarely works because the prompt was written assuming frontier-model capabilities.

### The Distill Approach

```
Prompt for Sonnet ──┐
                    │
                    ▼
              ┌──────────┐
              │ Analyze  │──► What does Sonnet do implicitly?
              │ Behavior │    What does 4o-mini need explicitly?
              └──────────┘
                    │
                    ▼
              ┌──────────┐
              │ Optimize │──► Add explicit context
              │ Prompt   │    Add examples
              └──────────┘    Add structure
                    │
                    ▼
Optimized Prompt ───────► GPT-4o-mini ──────► 95%+ success
                                              (same quality)
```

### What Gets Optimized

| Optimization | Example |
|--------------|---------|
| **Explicit context** | Add definitions for domain terms |
| **Few-shot examples** | Show input → output pairs |
| **Chain-of-thought** | `<think>` blocks for complex reasoning |
| **Output templates** | Strict JSON structure with examples |
| **Step-by-step workflows** | Numbered instructions |
| **Error handling** | Explicit "if X then Y" rules |

### Why It Works

Cheaper models have the same fundamental capabilities—they're trained on similar data with similar architectures. The main differences are:

1. **Parameter count**: Fewer parameters = less implicit knowledge
2. **Training compute**: Less fine-tuning = less instruction-following nuance
3. **Context window usage**: Less efficient use of long context

By making instructions explicit, we bridge these gaps without changing the model itself.

---

## LLM-as-Judge

### Why Not Simple Comparison?

Traditional evaluation compares strings:

```python
# String matching - too strict
assert output == expected  # "The answer is 4" ≠ "Four"

# Regex - brittle
assert re.match(r".*4.*", output)  # What about "four"?

# Embedding similarity - too loose
similarity(embed(output), embed(expected)) > 0.8  # "I don't know" might match
```

None of these capture **semantic equivalence**—whether the outputs mean the same thing.

### LLM-as-Judge Approach

Use another LLM to evaluate outputs:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│   Input: "What is the capital of France?"                        │
│                                                                   │
│   Gold standard (Sonnet):                                        │
│   "The capital of France is Paris."                              │
│                                                                   │
│   Target output (4o-mini):                                       │
│   "Paris is the capital city of France."                         │
│                                                                   │
│   ─────────────────────────────────────────────────────────────  │
│                                                                   │
│   Judge evaluation:                                               │
│   {                                                               │
│     "score": 0.95,                                                │
│     "passed": true,                                               │
│     "feedback": "Semantically equivalent. Same information,      │
│                  different phrasing. Both correct and complete." │
│   }                                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Evaluation Dimensions

The judge evaluates multiple aspects:

| Dimension | What It Measures | Example Failure |
|-----------|------------------|-----------------|
| **Correctness** | Is the answer factually right? | "Paris" vs "Lyon" |
| **Completeness** | Is all information included? | Missing booking confirmation ID |
| **Format** | Does it match expected structure? | Missing required JSON field |
| **Tone** | Is the style appropriate? | Too casual for enterprise use |
| **Reasoning** | Is the logic sound? | Jumped to conclusion without checking |

### Configuring the Judge

```yaml
judge:
  model: claude-sonnet-4-20250514
  threshold: 0.85  # Minimum score to pass

  criteria:
    - name: semantic_equivalence
      weight: 0.4
      prompt: "Do both outputs convey the same core meaning?"

    - name: completeness
      weight: 0.3
      prompt: "Does the target include all information from the gold standard?"

    - name: format
      weight: 0.2
      prompt: "Does the output match the expected structure?"

    - name: safety
      weight: 0.1
      prompt: "Does the output avoid harmful content?"
```

### When LLM-as-Judge Fails

The approach has limitations:

1. **Judge bias**: The judge model has its own biases
2. **Consistency**: Same input might get different scores
3. **Cost**: Judging adds LLM calls
4. **Circular reasoning**: Using LLMs to evaluate LLMs

**Mitigations**:
- Use a frontier model as judge (higher reliability)
- Run multiple judge passes and average
- Combine with deterministic checks where possible
- Human review for edge cases

---

## Iterative Prompt Refinement

### The Feedback Loop

Distill doesn't just try once—it iterates:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Iteration 1                                                    │
│   ├─ Run target model: 62% success                              │
│   ├─ Judge feedback: "Date parsing failures"                    │
│   └─ Modifier: Add explicit date rules                          │
│                                                                  │
│   Iteration 2                                                    │
│   ├─ Run target model: 78% success                              │
│   ├─ Judge feedback: "Informal language not understood"         │
│   └─ Modifier: Add language examples                            │
│                                                                  │
│   Iteration 3                                                    │
│   ├─ Run target model: 90% success                              │
│   ├─ Judge feedback: "Edge case reasoning failures"             │
│   └─ Modifier: Add chain-of-thought                             │
│                                                                  │
│   Iteration 4                                                    │
│   ├─ Run target model: 96% success ✓                            │
│   └─ Target achieved!                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### How the Modifier Works

The modifier is itself an LLM that:

1. **Analyzes failures**: Groups them by pattern
2. **Identifies root causes**: "12 failures all involve date parsing"
3. **Proposes solutions**: Specific prompt modifications
4. **Generates new prompt**: Incorporates fixes

```
Input to Modifier:
├─ Current prompt
├─ Failed test cases (with gold standard)
├─ Judge feedback for each failure
└─ Modification history (what's been tried)

Output from Modifier:
├─ Modified prompt
├─ Reasoning (why these changes)
└─ Expected improvement areas
```

### Convergence

The loop continues until:

1. **Success threshold met**: e.g., 95% pass rate
2. **Max iterations reached**: Prevent infinite loops
3. **No improvement**: Modifier can't find more optimizations

If the loop fails to converge, Distill reports:
- Best achieved success rate
- Remaining failure patterns
- Suggestions (e.g., "consider multi-agent decomposition")

---

## Multi-Agent Decomposition

### When Single Agent Isn't Enough

Sometimes a monolithic agent can't be effectively migrated. Signs:

1. **Diverse task types**: Agent handles very different kinds of work
2. **Conflicting requirements**: Some tasks need creativity, others need precision
3. **Complex state**: Too much context to fit in a single prompt
4. **Persistent low success**: Prompt optimization plateaus below target

### The Decomposition Strategy

Instead of one agent doing everything, split into specialized agents:

```
BEFORE: Single Agent (Sonnet)
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   "Do everything" agent                                          │
│   ├─ Handle customer questions                                   │
│   ├─ Process refunds                                             │
│   ├─ Analyze sentiment                                           │
│   ├─ Generate reports                                            │
│   └─ Escalate to human                                           │
│                                                                  │
│   Cost: $0.03/interaction                                        │
│   Success: 92%                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

AFTER: Multi-Agent (Cheap Models)
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Router (Haiku) ─────► Classify input type                     │
│       │                                                          │
│       ├───► FAQ Agent (4o-mini) ─────► Simple questions         │
│       │                                                          │
│       ├───► Refund Agent (4o-mini) ──► Process refunds          │
│       │                                                          │
│       ├───► Analysis Agent (4o-mini) ► Sentiment analysis       │
│       │                                                          │
│       └───► Escalation Agent (Haiku) ► Route to human           │
│                                                                  │
│   Cost: $0.005/interaction (avg)                                 │
│   Success: 94%                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Decomposition Works

1. **Simpler prompts**: Each agent has a focused task
2. **Right model for the job**: Use Haiku for classification, 4o-mini for generation
3. **Easier optimization**: Optimize each agent independently
4. **Better error handling**: Failures are isolated

### Phase 2 Preview

Distill Phase 2 will automate this:

```bash
distill analyze --config agent.yaml
# Output: Workload analysis, suggested decomposition

distill decompose --config agent.yaml --target multi-agent
# Output: Router + N specialized agents
```

---

## Tradeoffs

Every migration involves tradeoffs. Understanding them helps you make informed decisions.

### Cost vs Quality

```
                          Quality
                             ▲
                             │
                     Sonnet ─┼─ ● ─────────────── Best quality
                             │    \               Highest cost
                             │     \
                        4o ──┼──────● ─────────── Good quality
                             │       \            Medium cost
                             │        \
                  4o-mini ───┼─────────●───────── Acceptable quality
                             │          \         Lowest cost
                             │           \
                             │            ● ───── Unacceptable
                             │
                             └────────────────────► Cost

    Distill goal: Move DOWN the cost axis while staying
                  in the "Acceptable" quality zone
```

### Quality vs Latency

Cheaper models are often faster:

| Model | Avg Latency | Throughput |
|-------|-------------|------------|
| Claude Sonnet | 2-3s | Medium |
| GPT-4o-mini | 0.5-1s | High |
| Claude Haiku | 0.3-0.8s | Very High |

Optimized prompts are longer (more tokens), but:
- Cheaper models process tokens faster
- Net latency often decreases
- Throughput can increase significantly

### Prompt Length vs Reliability

Optimized prompts are longer:

```
Original (Sonnet):     ~200 tokens
Optimized (4o-mini):   ~500 tokens
```

But longer prompts mean:
- ✅ More explicit guidance
- ✅ More few-shot examples
- ❌ Higher input token cost
- ❌ Less room for context

**Net effect**: Usually still 80-90% cheaper due to token price difference.

### Iteration Time vs Success Rate

| Iterations | Typical Success | Time |
|------------|-----------------|------|
| 1-2 | 60-70% | 2-3 min |
| 3-5 | 80-90% | 5-10 min |
| 5-10 | 90-95% | 10-20 min |
| 10+ | 95%+ | 20+ min |

**Recommendation**: Start with `--max-iterations 5` and increase if needed.

### When NOT to Migrate

Sometimes migration isn't worth it:

| Scenario | Recommendation |
|----------|----------------|
| Low volume (<100 calls/day) | Stick with frontier model |
| Safety-critical | Keep frontier model, add guardrails |
| Rapidly changing requirements | Wait until stable |
| Already using cheap model | Consider multi-agent instead |

### Finding the Right Balance

Ask yourself:

1. **What's my budget?** If cost is critical, accept some quality loss.
2. **What's my quality floor?** Define minimum acceptable success rate.
3. **How much time can I invest?** More iterations = better results.
4. **What's the failure cost?** High-stakes = conservative migration.

---

## Summary

| Concept | Key Insight |
|---------|-------------|
| **Capability Gap** | Cheap models can do what frontier models do—with explicit guidance |
| **Intelligent Downgrade** | Make implicit instructions explicit |
| **LLM-as-Judge** | Semantic comparison beats string matching |
| **Iterative Refinement** | Feedback loops converge on optimal prompts |
| **Multi-Agent** | Decomposition enables better model matching |
| **Tradeoffs** | Cost, quality, latency—pick your priorities |

---

Next: [API Reference](./API.md) - Using Distill programmatically

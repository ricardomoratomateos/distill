# Examples

This guide walks through a complete migration scenario: taking a CrossFit class booking agent from Claude Sonnet to GPT-4o-mini.

## Case Study: CrossFit Booking Agent

### The Problem

You've built an agent that books CrossFit classes. It works great with Claude Sonnet:

- Understands natural language requests ("Book me into the 6am WOD tomorrow")
- Handles edge cases (class full, conflicting bookings)
- Uses tools to check availability and make reservations
- **Cost: $0.025 per interaction**

At 500 interactions/day, that's **$375/month**. With GPT-4o-mini, it could be **$37/month**.

But when you just swap the model, success rate drops from 94% to 61%. The cheaper model:
- Misses implicit context ("tomorrow" vs specific date)
- Forgets to confirm booking details
- Calls tools in wrong order

Manually fixing this would take 10-15 hours of prompt engineering.

**With Distill: 15 minutes.**

---

## Step 1: Define Your Agent

Create `crossfit-agent.yaml`:

```yaml
name: "CrossFit Booking Agent"
version: "1.0.0"
description: "Books CrossFit classes based on natural language requests"

# Source model (the expensive one that works)
model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.3
  maxTokens: 1024

# The system prompt
systemPrompt: |
  You are a CrossFit gym booking assistant. Help members book classes.

  Available class types:
  - WOD (Workout of the Day) - General fitness
  - Olympic Lifting - Technique focused
  - Gymnastics - Skills like pull-ups, handstands
  - Open Gym - Self-directed training

  When booking:
  1. Confirm the class type and time
  2. Check availability
  3. Make the reservation
  4. Provide confirmation details

  Be friendly but concise. Members are busy.

# Tools the agent can use
tools:
  - name: check_availability
    description: Check if a class has open spots
    parameters:
      type: object
      required: [date, time, classType]
      properties:
        date:
          type: string
          description: Date in YYYY-MM-DD format
        time:
          type: string
          description: Time in HH:MM format (24h)
        classType:
          type: string
          enum: [WOD, Olympic Lifting, Gymnastics, Open Gym]

  - name: make_reservation
    description: Book a spot in a class
    parameters:
      type: object
      required: [date, time, classType, memberId]
      properties:
        date:
          type: string
        time:
          type: string
        classType:
          type: string
        memberId:
          type: string

  - name: get_member_schedule
    description: Get member's existing bookings
    parameters:
      type: object
      required: [memberId]
      properties:
        memberId:
          type: string

# What success looks like
objective: |
  Successfully book the requested class, handling edge cases gracefully

successCriteria:
  - Correctly interprets user intent (class type, date, time)
  - Checks availability before booking
  - Confirms booking with all details
  - Handles conflicts (already booked, class full) appropriately

# Output structure
outputSchema:
  type: object
  required: [status, message]
  properties:
    status:
      type: string
      enum: [success, failed, needs_clarification]
    message:
      type: string
    bookingId:
      type: string
    classDetails:
      type: object
      properties:
        date: { type: string }
        time: { type: string }
        type: { type: string }

# Constraints for migration
constraints:
  targetSuccessRate: 0.95
  maxCostPerRun: 0.005
  maxIterations: 10
```

---

## Step 2: Create Test Cases

The profiler will generate these automatically, but you can also provide seed cases.

Create `test-cases.json`:

```json
[
  {
    "id": "simple-booking",
    "input": "Book me into tomorrow's 6am WOD",
    "context": {
      "memberId": "member_123",
      "currentDate": "2024-01-15"
    },
    "category": "happy-path"
  },
  {
    "id": "ambiguous-time",
    "input": "I want to do Olympic lifting this week",
    "context": {
      "memberId": "member_123",
      "currentDate": "2024-01-15"
    },
    "category": "clarification-needed"
  },
  {
    "id": "class-full",
    "input": "Sign me up for the 5pm WOD today",
    "context": {
      "memberId": "member_123",
      "currentDate": "2024-01-15",
      "mockResponses": {
        "check_availability": { "available": false, "spotsLeft": 0 }
      }
    },
    "category": "edge-case"
  },
  {
    "id": "already-booked",
    "input": "Book the 7am gymnastics class tomorrow",
    "context": {
      "memberId": "member_123",
      "currentDate": "2024-01-15",
      "mockResponses": {
        "get_member_schedule": {
          "bookings": [
            { "date": "2024-01-16", "time": "07:00", "type": "WOD" }
          ]
        }
      }
    },
    "category": "conflict"
  },
  {
    "id": "casual-language",
    "input": "hey can u get me into lifting tmrw morning?",
    "context": {
      "memberId": "member_456",
      "currentDate": "2024-01-15"
    },
    "category": "informal"
  }
]
```

---

## Step 3: Profile the Source Model

Run the profiler to establish the gold standard:

```bash
distill profile \
  --config crossfit-agent.yaml \
  --test-cases test-cases.json \
  --runs 50 \
  --output profile-data.json
```

**Output:**

```
🔬 Distill Profiler v0.1.0

📋 Loading agent: CrossFit Booking Agent
   Model: claude-sonnet-4-20250514
   Tools: 3 configured

📊 Profiling with 50 runs...

   [████████████████████████████████████████] 50/50

✅ Profiling complete!

   ┌────────────────────────────────────────┐
   │  BASELINE METRICS                      │
   ├────────────────────────────────────────┤
   │  Total runs:        50                 │
   │  Successful:        47 (94%)           │
   │  Failed:            3 (6%)             │
   │                                        │
   │  Avg cost/run:      $0.0243            │
   │  Avg latency:       2.1s               │
   │  Avg tool calls:    2.3                │
   │                                        │
   │  Category breakdown:                   │
   │  • happy-path:      100% success       │
   │  • clarification:   90% success        │
   │  • edge-case:       85% success        │
   │  • conflict:        95% success        │
   │  • informal:        90% success        │
   └────────────────────────────────────────┘

📁 Saved: profile-data.json
📊 LangSmith dataset: crossfit-agent-gold-standard
```

---

## Step 4: Run Migration

Now migrate to GPT-4o-mini:

```bash
distill migrate \
  --config crossfit-agent.yaml \
  --profile profile-data.json \
  --target gpt-4o-mini \
  --target-provider openai \
  --threshold 0.95 \
  --max-iterations 10
```

**Output:**

```
🚀 Distill Migration v0.1.0

📋 Source: claude-sonnet-4-20250514 (94% success, $0.024/run)
🎯 Target: gpt-4o-mini
📊 Test cases: 50

Starting migration...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration 1/10

   Running target model...
   [████████████████████████████████████████] 50/50

   📊 Results: 31/50 passed (62%)

   🔍 Judge Analysis:
      • 12 failures: Date parsing ("tomorrow" not converted)
      • 5 failures: Missing confirmation step
      • 2 failures: Wrong tool call order

   💡 Modifier Proposal:
      Adding explicit date handling instructions and step-by-step workflow

   Applying modification...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration 2/10

   Running target model...
   [████████████████████████████████████████] 50/50

   📊 Results: 39/50 passed (78%)

   🔍 Judge Analysis:
      • 6 failures: Informal language not understood
      • 3 failures: Conflict handling incomplete
      • 2 failures: Output format inconsistent

   💡 Modifier Proposal:
      Adding examples of informal language + explicit output format

   Applying modification...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration 3/10

   Running target model...
   [████████████████████████████████████████] 50/50

   📊 Results: 45/50 passed (90%)

   🔍 Judge Analysis:
      • 3 failures: Edge cases with full classes
      • 2 failures: Multi-step reasoning gaps

   💡 Modifier Proposal:
      Adding chain-of-thought for complex scenarios

   Applying modification...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Iteration 4/10

   Running target model...
   [████████████████████████████████████████] 50/50

   📊 Results: 48/50 passed (96%) ✓

   🎉 Target success rate achieved!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ MIGRATION COMPLETE

   ┌─────────────────────────────────────────────────────────┐
   │                                                          │
   │   BEFORE                 AFTER                          │
   │   ──────                 ─────                          │
   │   claude-sonnet    →    gpt-4o-mini                     │
   │   $0.024/run       →    $0.003/run                      │
   │   94% success      →    96% success                     │
   │   2.1s latency     →    0.9s latency                    │
   │                                                          │
   │   ────────────────────────────────────────────────────  │
   │                                                          │
   │   💰 SAVINGS                                             │
   │   Cost reduction:    87.5%                              │
   │   At 500 runs/day:   $315/month saved                   │
   │                                                          │
   │   📈 IMPROVEMENTS                                        │
   │   Success rate:      +2%                                │
   │   Latency:           -57%                               │
   │                                                          │
   └─────────────────────────────────────────────────────────┘

📁 Files saved:
   • crossfit-agent.optimized.yaml (new config)
   • migration-report.json (detailed analysis)
   • prompt-diff.md (before/after comparison)
```

---

## Step 5: Review the Optimized Prompt

Check `prompt-diff.md` to see what changed:

```markdown
# Prompt Modifications

## Original Prompt (claude-sonnet-4-20250514)

You are a CrossFit gym booking assistant. Help members book classes.
...
Be friendly but concise. Members are busy.

## Optimized Prompt (gpt-4o-mini)

You are a CrossFit gym booking assistant. Help members book classes.

## IMPORTANT: Date Handling
- "tomorrow" = current date + 1 day
- "this week" = ask which specific day
- "morning" = 06:00-09:00, "afternoon" = 12:00-15:00, "evening" = 17:00-20:00
- Always convert to YYYY-MM-DD format before calling tools

## Language Understanding
Members may use informal language. Examples:
- "tmrw" = tomorrow
- "lifting" = Olympic Lifting
- "can u" = can you

## Workflow (follow exactly)
1. Parse the request → identify: class type, date, time
2. If anything is ambiguous → ask for clarification
3. Call check_availability with exact parameters
4. If available → call make_reservation
5. If not available → suggest alternatives
6. Always end with confirmation or clear next steps

## Output Format
Always respond with this structure:
{
  "status": "success" | "failed" | "needs_clarification",
  "message": "Human-readable response",
  "bookingId": "...",  // if successful
  "classDetails": { "date": "...", "time": "...", "type": "..." }
}

## Edge Case Handling
<think>
Before responding to complex requests, reason through:
1. What exactly is the user asking for?
2. Do I have all required information?
3. What could go wrong?
</think>

Available class types:
- WOD (Workout of the Day) - General fitness
...
```

**Key optimizations made:**
1. Explicit date parsing rules (cheap models need this)
2. Informal language examples (few-shot learning)
3. Step-by-step workflow (reduces reasoning errors)
4. Output format template (ensures consistency)
5. Chain-of-thought for edge cases (improves complex reasoning)

---

## Step 6: Validate in Production

Before deploying, run a final validation:

```bash
distill evaluate \
  --config crossfit-agent.optimized.yaml \
  --profile profile-data.json \
  --runs 100 \
  --output validation-report.json
```

**Output:**

```
🔍 Distill Evaluation v0.1.0

📋 Agent: CrossFit Booking Agent (optimized)
   Model: gpt-4o-mini

📊 Running 100 test cases...

   [████████████████████████████████████████] 100/100

✅ Evaluation complete!

   ┌────────────────────────────────────────┐
   │  VALIDATION RESULTS                    │
   ├────────────────────────────────────────┤
   │  Total runs:        100                │
   │  Passed:            96 (96%)           │
   │  Failed:            4 (4%)             │
   │                                        │
   │  Category breakdown:                   │
   │  • happy-path:      100% (30/30)       │
   │  • clarification:   93% (28/30)        │
   │  • edge-case:       90% (18/20)        │
   │  • conflict:        100% (15/15)       │
   │  • informal:        100% (5/5)         │
   │                                        │
   │  vs Gold Standard:                     │
   │  • Semantic match:  0.94 avg           │
   │  • Format match:    0.98 avg           │
   │  • Tool usage:      0.96 avg           │
   └────────────────────────────────────────┘

   ⚠️  4 failures analyzed:
      • 2x edge case: very unusual phrasing
      • 2x clarification: ambiguous multi-class requests

   💡 Recommendation: 96% meets target. Safe to deploy.

📁 Saved: validation-report.json
```

---

## Step 7: Deploy

Use the optimized config in your application:

```typescript
import { createAgent } from '@distill/core';
import optimizedConfig from './crossfit-agent.optimized.yaml';

const agent = createAgent(optimizedConfig);

// Same interface as before
const result = await agent.execute({
  input: "Book me into tomorrow's 6am WOD",
  context: { memberId: "member_123" }
});
```

---

## Understanding the Results

### What the Modifier Did

| Iteration | Success | Key Change |
|-----------|---------|------------|
| 0 (baseline) | 62% | No changes |
| 1 | 78% | Added date parsing rules |
| 2 | 90% | Added informal language examples |
| 3 | 96% | Added chain-of-thought for edge cases |

### Why It Worked

1. **Explicit > Implicit**: Sonnet infers "tomorrow" means +1 day. 4o-mini needs to be told.

2. **Examples > Rules**: "Handle informal language" doesn't help. Showing "tmrw = tomorrow" does.

3. **Structure > Freedom**: Step-by-step workflow prevents the model from skipping steps.

4. **Think out loud**: `<think>` tags force the model to reason before acting.

### Cost Breakdown

| Metric | Sonnet | 4o-mini | Savings |
|--------|--------|---------|---------|
| Input tokens | ~500 | ~800* | - |
| Output tokens | ~200 | ~250* | - |
| Cost/run | $0.024 | $0.003 | 87.5% |
| Monthly (500/day) | $360 | $45 | $315 |

*Optimized prompt is longer, but 4o-mini is 100x cheaper per token.

---

## Troubleshooting

### Migration stuck at low success rate

```bash
# Try with more iterations
distill migrate --max-iterations 15

# Or lower the threshold temporarily
distill migrate --threshold 0.90
```

### Judge seems too strict/lenient

```bash
# Customize judge criteria
distill migrate --judge-criteria criteria.yaml
```

```yaml
# criteria.yaml
criteria:
  - name: semantic_equivalence
    weight: 0.4
    description: "Core meaning is preserved"
  - name: format_compliance
    weight: 0.3
    description: "Output matches expected structure"
  - name: tool_usage
    weight: 0.3
    description: "Correct tools called with correct params"
```

### Need to exclude certain test cases

```bash
# Filter by category
distill migrate --exclude-categories "edge-case,experimental"
```

---

## Next Steps

- [API Reference](./API.md) - Use Distill programmatically
- [Concepts](./CONCEPTS.md) - Understand the theory
- [Architecture](./ARCHITECTURE.md) - How it all fits together

---

## Real-World Results

Teams using Distill have reported:

| Use Case | Source | Target | Savings |
|----------|--------|--------|---------|
| Customer support | Sonnet | 4o-mini | 89% |
| Code review | GPT-4 | 4o-mini | 92% |
| Data extraction | Sonnet | Haiku | 85% |
| Content moderation | GPT-4 | 4o-mini | 94% |

Average migration time: **12 minutes** (vs 10-15 hours manual).

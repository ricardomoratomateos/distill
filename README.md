# Distill

**Migrate LLM agents from expensive to cheap models. Automatically.**

```
Claude Sonnet ($15/MTok) → GPT-4o-mini ($0.15/MTok) = 100x cost reduction
```

You built an agent that works perfectly with Claude Sonnet. It costs $0.02 per run. At 10,000 runs/month, that's $200. With GPT-4o-mini, it could be $2.

But migrating manually means 15+ hours of:
- Rewriting prompts that "just work" on smart models
- Running hundreds of test cases
- Debugging subtle failures
- Repeat for every new cheaper model

**Distill automates this entire process.**

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Your Agent          Distill              Optimized Agent          │
│   (Sonnet)              │                  (GPT-4o-mini)            │
│       │                 │                       │                   │
│       ▼                 ▼                       ▼                   │
│   ┌───────┐      ┌─────────────┐         ┌───────────┐              │
│   │$0.02  │ ───▶ │  Profile    │         │  $0.002   │              │
│   │/run   │      │  Judge      │ ──────▶ │  /run     │              │
│   │       │      │  Optimize   │         │           │              │
│   │  95%  │      │  Validate   │         │   96%     │              │
│   │success│      └─────────────┘         │  success  │              │
│   └───────┘            │                 └───────────┘              │
│                        │                                            │
│                        ▼                                            │
│              Iterates until 95%+ success                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
# Clone and setup
git clone https://github.com/your-org/distill.git
cd distill
pnpm install
pnpm build

# Configure API keys
cp .env.example .env
# Add your ANTHROPIC_API_KEY and OPENAI_API_KEY
```

### Your First Migration

**1. Define your agent** (`agent.yaml`):

```yaml
name: "Customer Support Bot"
description: "Answers product questions"

model:
  provider: anthropic
  name: claude-sonnet-4-20250514

systemPrompt: |
  You are a helpful customer support agent for TechCorp.
  Answer questions about our products accurately and concisely.

tools:
  - name: search_docs
    description: Search product documentation

objective: |
  Provide accurate, helpful answers to customer questions

successCriteria:
  - Answers are factually correct
  - Tone is professional and friendly
  - Uses search_docs when needed
```

**2. Profile your agent** (creates gold standard):

```bash
distill profile -c agent.yaml -n 50
```

**3. Migrate to cheaper model**:

```bash
distill migrate -c agent.yaml -t gpt-4o-mini
```

**Output:**

```
🔧 Loading agent from agent.yaml...
📊 Profiling source model (claude-sonnet-4-20250514)...
   Running 50 test cases...
✅ Baseline established:
   • Cost: $0.018/run
   • Success rate: 94%
   • Avg latency: 2.3s

🎯 Target: gpt-4o-mini

🚀 Starting migration...

   Iteration 1/10
   ├─ Running evaluation... 42% success
   ├─ Judge feedback: "Missing context for product-specific terms"
   └─ Modifier: Adding explicit product glossary to prompt

   Iteration 2/10
   ├─ Running evaluation... 71% success
   ├─ Judge feedback: "Inconsistent formatting in responses"
   └─ Modifier: Adding output format examples

   Iteration 3/10
   ├─ Running evaluation... 88% success
   ├─ Judge feedback: "Edge cases with ambiguous questions"
   └─ Modifier: Adding chain-of-thought for complex queries

   Iteration 4/10
   ├─ Running evaluation... 96% success ✓
   └─ Target achieved!

✨ Migration complete!

   ┌────────────────────────────────────────┐
   │  Metric          Before      After     │
   │  ─────────────────────────────────────│
   │  Model           Sonnet      4o-mini   │
   │  Cost/run        $0.018      $0.002    │
   │  Success rate    94%         96%       │
   │  Latency         2.3s        0.8s      │
   │  ─────────────────────────────────────│
   │  Monthly savings (10k runs): $160      │
   └────────────────────────────────────────┘

📝 Saved: agent.optimized.yaml
```

## Features

### Phase 1 (Current)
- **Automatic Profiling**: Run your agent, capture gold standard outputs
- **LLM-as-Judge Evaluation**: Smart comparison of outputs, not just string matching
- **Iterative Prompt Optimization**: Automatically refines prompts based on failures
- **Multi-Provider Support**: Anthropic, OpenAI (more coming)
- **Cost Tracking**: Know exactly what you're saving

### Phase 2 (Roadmap)
- **Multi-Agent Decomposition**: Automatically split complex agents into specialized sub-agents
- **Architecture Optimization**: Router + specialized agents for different task types
- **Visual Dashboard**: Web UI for monitoring migrations
- **CI/CD Integration**: Automated regression testing

## When to Use Distill

| Scenario | Distill Helps? |
|----------|---------------|
| Agent works on Sonnet, need to cut costs | ✅ Yes |
| Building new agent, want to start cheap | ⚠️ Build with Sonnet first, then Distill |
| Agent has consistent failures on cheap model | ✅ Yes |
| Need to migrate to new model (GPT-5, etc) | ✅ Yes |
| Agent requires vision/multimodal | 🔜 Coming in Phase 2 |

## Architecture

Distill is designed to evolve:

```
Phase 1: SingleAgent optimization
         ┌─────────────────────────┐
         │  Profiler → Judge →     │
         │  PromptModifier →       │
         │  Validator              │
         └─────────────────────────┘

Phase 2: MultiAgent decomposition (same interfaces)
         ┌─────────────────────────┐
         │  Profiler → Judge →     │
         │  ArchModifier →         │  ← New modifier, same flow
         │  Validator              │
         └─────────────────────────┘
```

The `Agent` interface abstracts single vs multi-agent:

```typescript
interface Agent {
  execute(input: Input): Promise<Output>;
  getCost(): number;
}

// Phase 1: SingleAgent implements Agent
// Phase 2: MultiAgent implements Agent (drop-in replacement)
```

→ [Full architecture docs](./docs/ARCHITECTURE.md)

## Documentation

- [**Architecture**](./docs/ARCHITECTURE.md) - System design and component overview
- [**Concepts**](./docs/CONCEPTS.md) - Core ideas: LLM-as-Judge, downgrade strategies
- [**Examples**](./docs/EXAMPLES.md) - Complete walkthrough with real agent
- [**API Reference**](./docs/API.md) - Programmatic usage
- [**Contributing**](./CONTRIBUTING.md) - Development setup and guidelines

## Project Structure

```
distill/
├── packages/
│   ├── core/           # Main logic (provider-agnostic)
│   │   ├── profiler/   # Captures agent behavior
│   │   ├── judge/      # LLM-based evaluation
│   │   ├── modifier/   # Prompt & architecture optimization
│   │   ├── agents/     # Agent abstractions
│   │   └── validator/  # End-to-end testing
│   ├── cli/            # Command-line interface
│   └── web/            # Dashboard (placeholder)
├── examples/           # Real-world examples
├── docs/               # Documentation
├── turbo.json          # Turborepo task configuration
└── pnpm-workspace.yaml # pnpm workspaces config
```

## Development

This project uses **pnpm workspaces** + **Turborepo** for fast, cached builds:

```bash
pnpm build      # Build all packages (with caching)
pnpm dev        # Watch mode for all packages
pnpm test       # Run tests in parallel
pnpm lint       # Lint all packages
pnpm typecheck  # TypeScript validation
pnpm clean      # Clean build artifacts and cache
```

Turborepo caches build outputs - subsequent builds are near-instant if nothing changed.

## Roadmap

### v0.1 - MVP (Phase 1)
- [x] Core abstractions (Agent, Profiler, Judge)
- [x] CLI commands (profile, migrate, evaluate)
- [x] Prompt optimization loop
- [ ] LangSmith integration
- [ ] Comprehensive test suite

### v0.2 - Production Ready
- [ ] Parallel evaluation runs
- [ ] Custom judge criteria
- [ ] Export to multiple formats
- [ ] Docker support

### v0.3 - Phase 2 Preview
- [ ] Workload analyzer
- [ ] Multi-agent decomposition
- [ ] Architecture templates

### v1.0 - Full Release
- [ ] Web dashboard
- [ ] Team collaboration
- [ ] CI/CD integration

## Why Open Source?

LLM costs are a universal problem. Every team building with AI faces the same migration pain. By open-sourcing Distill:

1. **Community improvements**: More edge cases, more optimizations
2. **Provider support**: Community can add Mistral, Llama, etc.
3. **Trust**: See exactly how your prompts are being modified
4. **Standards**: Help establish best practices for LLM migration

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Running tests
- Submitting PRs
- Code style guidelines

## License

MIT License - see [LICENSE](./LICENSE)

---

**Built with frustration from manually migrating agents too many times.**

[Documentation](./docs/) · [Examples](./docs/EXAMPLES.md) · [Discord](#) · [Twitter](#)

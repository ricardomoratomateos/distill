import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type {
  ModelConfig,
  AgentSpec,
  AgentInput,
  AgentOutput,
  IAgent,
  Trace,
  TraceStep,
  CostMetrics,
  AgentRole,
  AgentContext,
} from "../types/index.js";

// Pricing per 1M tokens (approximate)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-3-5-20241022": { input: 0.25, output: 1.25 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export interface AgentConfig {
  role?: AgentRole;
  model: ModelConfig;
  systemPrompt?: string;
  spec?: AgentSpec;
}

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Agent class that implements IAgent interface
 * Wraps LLM providers with consistent interface
 */
export class Agent implements IAgent {
  readonly type: "single" | "multi" = "single";
  readonly spec: AgentSpec;

  private model: BaseChatModel;
  private config: AgentConfig;
  private context: AgentContext;
  private conversationHistory: AgentMessage[] = [];

  // Tracking for cost and trace
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private traceSteps: TraceStep[] = [];
  private traceStartTime: string | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.model = this.createModel(config.model);

    // Create spec from config if not provided
    this.spec = config.spec ?? {
      name: "Agent",
      version: "1.0.0",
      description: "LLM Agent",
      model: config.model,
      systemPrompt: config.systemPrompt ?? "",
      tools: [],
      successCriteria: [],
    };

    this.context = {
      role: config.role ?? "migrator",
      config: config.model,
    };
  }

  private createModel(config: ModelConfig): BaseChatModel {
    switch (config.provider) {
      case "anthropic":
        return new ChatAnthropic({
          model: config.name,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });
      case "openai":
        return new ChatOpenAI({
          model: config.name,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Execute the agent with given input (IAgent interface)
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    if (!this.traceStartTime) {
      this.traceStartTime = new Date().toISOString();
    }

    const stepStart = Date.now();
    const messages = [];

    if (this.config.systemPrompt || this.spec.systemPrompt) {
      messages.push(new SystemMessage(this.config.systemPrompt || this.spec.systemPrompt));
    }

    messages.push(new HumanMessage(input.message));

    const response = await this.model.invoke(messages);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Track tokens
    const usage = response.usage_metadata;
    if (usage) {
      this.totalInputTokens += usage.input_tokens ?? 0;
      this.totalOutputTokens += usage.output_tokens ?? 0;
    }

    // Add trace step
    this.traceSteps.push({
      type: "llm",
      timestamp: new Date().toISOString(),
      duration: Date.now() - stepStart,
      input: input.message,
      output: content,
      tokenUsage: usage ? {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
      } : undefined,
    });

    return {
      content,
      metadata: {
        model: this.spec.model.name,
        provider: this.spec.model.provider,
      },
    };
  }

  /**
   * Get cost metrics (IAgent interface)
   */
  getCost(): CostMetrics {
    const pricing = PRICING[this.spec.model.name] ?? { input: 1.0, output: 2.0 };
    const inputCost = (this.totalInputTokens / 1_000_000) * pricing.input;
    const outputCost = (this.totalOutputTokens / 1_000_000) * pricing.output;

    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalCost: inputCost + outputCost,
      currency: "USD",
    };
  }

  /**
   * Get execution trace (IAgent interface)
   */
  getTrace(): Trace {
    const endTime = new Date().toISOString();
    const totalDuration = this.traceSteps.reduce((sum, step) => sum + step.duration, 0);

    return {
      id: crypto.randomUUID(),
      startTime: this.traceStartTime ?? endTime,
      endTime,
      steps: this.traceSteps,
      totalDuration,
      totalCost: this.getCost().totalCost,
    };
  }

  /**
   * Get current configuration (IAgent interface)
   */
  getConfig(): AgentSpec {
    return { ...this.spec };
  }

  /**
   * Simple invoke for single-turn (backward compatibility)
   */
  async invoke(message: string): Promise<string> {
    const result = await this.execute({ message });
    return result.content;
  }

  /**
   * Multi-turn conversation with history
   */
  async chat(message: string): Promise<string> {
    if (!this.traceStartTime) {
      this.traceStartTime = new Date().toISOString();
    }

    const stepStart = Date.now();
    const messages = [];

    if (this.config.systemPrompt || this.spec.systemPrompt) {
      messages.push(new SystemMessage(this.config.systemPrompt || this.spec.systemPrompt));
    }

    // Add conversation history
    for (const msg of this.conversationHistory) {
      if (msg.role === "user") {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === "assistant") {
        messages.push(new AIMessage(msg.content));
      }
    }

    messages.push(new HumanMessage(message));

    const response = await this.model.invoke(messages);
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Track tokens
    const usage = response.usage_metadata;
    if (usage) {
      this.totalInputTokens += usage.input_tokens ?? 0;
      this.totalOutputTokens += usage.output_tokens ?? 0;
    }

    // Update history
    this.conversationHistory.push({ role: "user", content: message });
    this.conversationHistory.push({ role: "assistant", content });

    // Add trace step
    this.traceSteps.push({
      type: "llm",
      timestamp: new Date().toISOString(),
      duration: Date.now() - stepStart,
      input: message,
      output: content,
      tokenUsage: usage ? {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
      } : undefined,
    });

    return content;
  }

  /**
   * Update system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
    (this.spec as any).systemPrompt = prompt;
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Reset cost and trace tracking
   */
  resetTracking(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.traceSteps = [];
    this.traceStartTime = null;
  }

  /**
   * Get agent context
   */
  getContext(): AgentContext {
    return { ...this.context };
  }

  /**
   * Get agent role
   */
  get role(): AgentRole {
    return this.context.role;
  }
}

/**
 * Create agent from AgentSpec (YAML config)
 */
export function createAgentFromSpec(spec: AgentSpec, role?: AgentRole): Agent {
  return new Agent({
    role: role ?? "migrator",
    model: spec.model,
    systemPrompt: spec.systemPrompt,
    spec,
  });
}

/**
 * Factory function to create agents
 */
export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}

/**
 * Create an agent for profiling (expensive model)
 */
export function createProfilerAgent(model: ModelConfig, systemPrompt?: string): Agent {
  return new Agent({
    role: "profiler",
    model,
    systemPrompt,
  });
}

/**
 * Create an agent for migration (cheap model)
 */
export function createMigratorAgent(model: ModelConfig, systemPrompt?: string): Agent {
  return new Agent({
    role: "migrator",
    model,
    systemPrompt,
  });
}

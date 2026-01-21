import type {
  ModelConfig,
  ProfileData,
  ProfileEntry,
  AgentSpec,
  TestCase,
} from "../types/index.js";
import { ProfileDataSchema } from "../types/index.js";
import { Agent, createAgentFromSpec } from "../agents/index.js";

export interface ProfilerConfig {
  model?: ModelConfig;
  spec?: AgentSpec;
  batchSize?: number;
}

export interface ProfilerInput {
  prompt: string;
  context?: Record<string, unknown>;
  category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Profiler captures input/output pairs from an expensive model
 * to create a dataset for migration training (gold standard)
 */
export class Profiler {
  private agent: Agent;
  private config: ProfilerConfig;
  private entries: ProfileEntry[] = [];
  private modelConfig: ModelConfig;

  constructor(config: ProfilerConfig) {
    this.config = config;

    if (config.spec) {
      this.agent = createAgentFromSpec(config.spec, "profiler");
      this.modelConfig = config.spec.model;
    } else if (config.model) {
      this.agent = new Agent({
        role: "profiler",
        model: config.model,
      });
      this.modelConfig = config.model;
    } else {
      throw new Error("Either model or spec must be provided");
    }
  }

  /**
   * Profile a single input and capture the output
   */
  async profile(input: ProfilerInput): Promise<ProfileEntry> {
    const startTime = Date.now();

    this.agent.resetTracking();
    const result = await this.agent.execute({ message: input.prompt });
    const cost = this.agent.getCost();
    const latency = Date.now() - startTime;

    const entry: ProfileEntry = {
      id: crypto.randomUUID(),
      input: input.prompt,
      output: result.content,
      cost: cost.totalCost,
      latency,
      category: input.category,
      metadata: input.metadata,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Profile multiple inputs in batch
   */
  async profileBatch(inputs: ProfilerInput[]): Promise<ProfileEntry[]> {
    const results: ProfileEntry[] = [];
    const batchSize = this.config.batchSize ?? 5;

    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((input) => this.profile(input))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Profile from test cases
   */
  async profileTestCases(testCases: TestCase[]): Promise<ProfileEntry[]> {
    const inputs: ProfilerInput[] = testCases.map((tc) => ({
      prompt: tc.input,
      context: tc.context,
      category: tc.category,
      metadata: { testCaseId: tc.id },
    }));

    return this.profileBatch(inputs);
  }

  /**
   * Export captured profile data
   */
  export(): ProfileData {
    const totalCost = this.entries.reduce((sum, e) => sum + (e.cost ?? 0), 0);
    const totalLatency = this.entries.reduce((sum, e) => sum + (e.latency ?? 0), 0);

    const data: ProfileData = {
      sourceModel: this.modelConfig,
      agentName: this.config.spec?.name,
      entries: this.entries,
      metrics: {
        totalRuns: this.entries.length,
        successRate: 1.0, // TODO: Implement actual success tracking
        avgCost: this.entries.length > 0 ? totalCost / this.entries.length : 0,
        avgLatency: this.entries.length > 0 ? totalLatency / this.entries.length : 0,
      },
      createdAt: new Date().toISOString(),
      version: "1.0.0",
    };

    return ProfileDataSchema.parse(data);
  }

  /**
   * Load existing profile data
   */
  load(data: ProfileData): void {
    const validated = ProfileDataSchema.parse(data);
    this.entries = validated.entries;
  }

  /**
   * Get current entries count
   */
  get count(): number {
    return this.entries.length;
  }

  /**
   * Get metrics summary
   */
  getMetrics(): { totalRuns: number; avgCost: number; avgLatency: number } {
    const totalCost = this.entries.reduce((sum, e) => sum + (e.cost ?? 0), 0);
    const totalLatency = this.entries.reduce((sum, e) => sum + (e.latency ?? 0), 0);

    return {
      totalRuns: this.entries.length,
      avgCost: this.entries.length > 0 ? totalCost / this.entries.length : 0,
      avgLatency: this.entries.length > 0 ? totalLatency / this.entries.length : 0,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }
}

export type { ProfileEntry, ProfileData } from "../types/index.js";

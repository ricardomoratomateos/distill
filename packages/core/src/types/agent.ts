import { z } from 'zod';

/**
 * Input/Output types for agent execution
 */
export interface AgentInput {
  message: string;
  context?: Record<string, unknown>;
}

export interface AgentOutput {
  response: string;
  metadata?: Record<string, unknown>;
}

/**
 * Trace of a single agent execution
 */
export interface AgentTrace {
  input: AgentInput;
  output: AgentOutput;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  cost: number;
  timestamp: Date;
  modelUsed: string;
}

/**
 * Base Agent interface - works for both single and multi-agent
 */
export interface Agent {
  readonly type: 'single' | 'multi-agent';
  readonly name: string;
  
  /**
   * Execute the agent with given input
   */
  execute(input: AgentInput): Promise<AgentOutput>;
  
  /**
   * Get the last execution trace
   */
  getLastTrace(): AgentTrace | null;
  
  /**
   * Get cost of last execution
   */
  getLastCost(): number;
}

/**
 * Configuration for a single agent
 */
export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  
  model: z.object({
    provider: z.enum(['anthropic', 'openai', 'google']),
    name: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
  }),
  
  systemPrompt: z.string(),
  
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    schema: z.record(z.any()),
  })).optional(),
  
  objective: z.string(),
  successCriteria: z.array(z.string()),
  
  outputSchema: z.record(z.any()).optional(),
  
  constraints: z.object({
    maxCostPerRun: z.number().positive().optional(),
    maxLatency: z.number().positive().optional(),
    minSuccessRate: z.number().min(0).max(1).default(0.95),
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
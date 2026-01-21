import { z } from "zod";
import { ModelConfigSchema, type ModelConfig, type CostMetrics } from "./model.js";

// Tool definition schema
export const ToolParameterSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  required: z.array(z.string()).optional(),
  properties: z.record(z.any()).optional(),
  enum: z.array(z.string()).optional(),
});

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: ToolParameterSchema.optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// Agent spec schema (YAML config)
export const AgentSpecSchema = z.object({
  name: z.string(),
  version: z.string().optional().default("1.0.0"),
  description: z.string(),

  model: ModelConfigSchema,

  systemPrompt: z.string(),

  tools: z.array(ToolDefinitionSchema).optional().default([]),

  objective: z.string().optional(),

  successCriteria: z.array(z.string()).optional().default([]),

  outputSchema: z.object({
    type: z.string(),
    required: z.array(z.string()).optional(),
    properties: z.record(z.any()).optional(),
  }).optional(),

  constraints: z.object({
    targetSuccessRate: z.number().min(0).max(1).optional().default(0.95),
    maxCostPerRun: z.number().optional(),
    maxIterations: z.number().optional().default(10),
    maxLatencyMs: z.number().optional(),
  }).optional(),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

// Agent input/output types
export interface AgentInput {
  message: string;
  context?: Record<string, unknown>;
  threadId?: string;
}

export interface AgentOutput {
  content: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

// Trace for debugging and profiling
export interface TraceStep {
  type: "llm" | "tool" | "error";
  timestamp: string;
  duration: number;
  input: unknown;
  output: unknown;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

export interface Trace {
  id: string;
  startTime: string;
  endTime: string;
  steps: TraceStep[];
  totalDuration: number;
  totalCost: number;
}

// Agent interface (core abstraction)
export interface IAgent {
  readonly type: "single" | "multi";
  readonly spec: AgentSpec;

  execute(input: AgentInput): Promise<AgentOutput>;
  getCost(): CostMetrics;
  getTrace(): Trace;
  getConfig(): AgentSpec;
}

// Agent roles for different contexts
export const AgentRoleSchema = z.enum([
  "profiler",
  "migrator",
  "validator",
  "judge",
  "coordinator",
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

export interface AgentContext {
  role: AgentRole;
  config: ModelConfig;
  metadata?: Record<string, unknown>;
}

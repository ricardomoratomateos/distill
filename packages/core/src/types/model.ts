import { z } from "zod";

export const ModelConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  name: z.string(),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const CostMetricsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
  currency: z.string().default("USD"),
});

export type CostMetrics = z.infer<typeof CostMetricsSchema>;

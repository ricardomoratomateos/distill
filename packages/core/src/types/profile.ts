import { z } from "zod";
import { ModelConfigSchema } from "./model.js";

export const ProfileEntrySchema = z.object({
  id: z.string(),
  input: z.string(),
  output: z.string(),
  trace: z.any().optional(),
  cost: z.number().optional(),
  latency: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  category: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ProfileEntry = z.infer<typeof ProfileEntrySchema>;

export const ProfileDataSchema = z.object({
  sourceModel: ModelConfigSchema,
  agentName: z.string().optional(),
  entries: z.array(ProfileEntrySchema),
  metrics: z.object({
    totalRuns: z.number(),
    successRate: z.number(),
    avgCost: z.number(),
    avgLatency: z.number(),
  }).optional(),
  createdAt: z.string().datetime(),
  version: z.string().default("1.0.0"),
});

export type ProfileData = z.infer<typeof ProfileDataSchema>;

export const TestCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  context: z.record(z.unknown()).optional(),
  category: z.string().optional(),
  expectedOutput: z.string().optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const TestSuiteSchema = z.object({
  name: z.string(),
  cases: z.array(TestCaseSchema),
  createdAt: z.string().datetime(),
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;

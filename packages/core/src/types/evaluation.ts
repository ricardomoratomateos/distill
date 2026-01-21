import { z } from "zod";

export const EvaluationResultSchema = z.object({
  entryId: z.string(),
  sourceOutput: z.string(),
  targetOutput: z.string(),
  score: z.number().min(0).max(1),
  feedback: z.string().optional(),
  passed: z.boolean(),
  dimensions: z.record(z.number()).optional(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const EvaluationSummarySchema = z.object({
  totalEntries: z.number(),
  passedEntries: z.number(),
  averageScore: z.number(),
  results: z.array(EvaluationResultSchema),
  byCategory: z.record(z.object({
    total: z.number(),
    passed: z.number(),
    avgScore: z.number(),
  })).optional(),
});

export type EvaluationSummary = z.infer<typeof EvaluationSummarySchema>;

export interface EvaluationCriteria {
  name: string;
  weight: number;
  description: string;
  prompt?: string;
}

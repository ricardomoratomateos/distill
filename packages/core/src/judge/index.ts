import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { ModelConfig, EvaluationResult, EvaluationCriteria } from "../types/index.js";

export interface JudgeConfig {
  model: ModelConfig;
  criteria?: EvaluationCriteria[];
  threshold?: number;
}

const DEFAULT_CRITERIA: EvaluationCriteria[] = [
  {
    name: "semantic_equivalence",
    weight: 0.4,
    description: "Does the target output convey the same meaning as the source?",
  },
  {
    name: "completeness",
    weight: 0.3,
    description: "Does the target output include all key information from the source?",
  },
  {
    name: "quality",
    weight: 0.2,
    description: "Is the target output well-structured and coherent?",
  },
  {
    name: "accuracy",
    weight: 0.1,
    description: "Are facts and details preserved correctly?",
  },
];

const JudgeResponseSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string(),
  dimensions: z.record(z.number()).optional(),
});

/**
 * Judge evaluates the quality of migrated outputs
 * by comparing them against source model outputs
 */
export class Judge {
  private model: BaseChatModel;
  private config: JudgeConfig;
  private criteria: EvaluationCriteria[];

  constructor(config: JudgeConfig) {
    this.config = config;
    this.criteria = config.criteria ?? DEFAULT_CRITERIA;
    this.model = this.createModel(config.model);
  }

  private createModel(config: ModelConfig): BaseChatModel {
    switch (config.provider) {
      case "anthropic":
        return new ChatAnthropic({
          model: config.name,
          temperature: 0,
          maxTokens: config.maxTokens,
        });
      case "openai":
        return new ChatOpenAI({
          model: config.name,
          temperature: 0,
          maxTokens: config.maxTokens,
        });
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  private buildSystemPrompt(): string {
    const criteriaText = this.criteria
      .map((c, i) => `${i + 1}. ${c.name} (weight: ${c.weight}): ${c.description}`)
      .join("\n");

    return `You are an expert evaluator comparing AI model outputs.

Your task is to evaluate how well a "target" output matches a "source" output for the same input.

Evaluation criteria:
${criteriaText}

You must respond with a JSON object containing:
- score: A number from 0 to 1 (0 = completely different, 1 = equivalent)
- feedback: A brief explanation of your evaluation
- dimensions: Optional object with scores for each criterion

Be strict but fair. Focus on semantic meaning over exact wording.
Respond ONLY with valid JSON, no other text.`;
  }

  private buildEvaluationPrompt(
    input: string,
    sourceOutput: string,
    targetOutput: string
  ): string {
    return `Evaluate the following:

**Input:**
${input}

**Source Output (reference/gold standard):**
${sourceOutput}

**Target Output (to evaluate):**
${targetOutput}

Respond with valid JSON only.`;
  }

  /**
   * Evaluate a single migration result
   */
  async evaluate(
    entryId: string,
    input: string,
    sourceOutput: string,
    targetOutput: string
  ): Promise<EvaluationResult> {
    const response = await this.model.invoke([
      new SystemMessage(this.buildSystemPrompt()),
      new HumanMessage(
        this.buildEvaluationPrompt(input, sourceOutput, targetOutput)
      ),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Judge did not return valid JSON");
    }

    const parsed = JudgeResponseSchema.parse(JSON.parse(jsonMatch[0]));
    const threshold = this.config.threshold ?? 0.8;

    return {
      entryId,
      sourceOutput,
      targetOutput,
      score: parsed.score,
      feedback: parsed.feedback,
      passed: parsed.score >= threshold,
      dimensions: parsed.dimensions,
    };
  }

  /**
   * Evaluate multiple results in batch
   */
  async evaluateBatch(
    items: Array<{
      entryId: string;
      input: string;
      sourceOutput: string;
      targetOutput: string;
    }>
  ): Promise<EvaluationResult[]> {
    return Promise.all(
      items.map((item) =>
        this.evaluate(item.entryId, item.input, item.sourceOutput, item.targetOutput)
      )
    );
  }

  /**
   * Get threshold for passing evaluation
   */
  get threshold(): number {
    return this.config.threshold ?? 0.8;
  }

  /**
   * Get current criteria
   */
  getCriteria(): EvaluationCriteria[] {
    return [...this.criteria];
  }
}

export type { EvaluationResult, EvaluationCriteria } from "../types/index.js";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ModelConfig, ProfileEntry, EvaluationResult } from "../types/index.js";

export interface ModifierConfig {
  model: ModelConfig;
  maxIterations?: number;
}

export interface PromptModification {
  originalPrompt: string;
  modifiedPrompt: string;
  reasoning: string;
  changes: string[];
  iteration: number;
}

/**
 * Modifier improves system prompts based on evaluation feedback
 * to help cheaper models match expensive model quality
 */
export class Modifier {
  private model: BaseChatModel;
  private config: ModifierConfig;
  private modifications: PromptModification[] = [];

  constructor(config: ModifierConfig) {
    this.config = config;
    this.model = this.createModel(config.model);
  }

  private createModel(config: ModelConfig): BaseChatModel {
    switch (config.provider) {
      case "anthropic":
        return new ChatAnthropic({
          model: config.name,
          temperature: 0.7,
          maxTokens: config.maxTokens ?? 4096,
        });
      case "openai":
        return new ChatOpenAI({
          model: config.name,
          temperature: 0.7,
          maxTokens: config.maxTokens ?? 4096,
        });
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert prompt engineer specializing in LLM migration.

Your task is to modify a system prompt to help a cheaper/smaller model produce outputs
that match the quality and style of a more expensive/larger model.

When given:
1. The original system prompt
2. Example inputs and expected outputs (from the expensive model)
3. Failed evaluations showing where the cheaper model diverged

You should:
1. Analyze the patterns in the expected outputs
2. Identify what the cheaper model is missing
3. Modify the system prompt to guide the cheaper model better

Return a JSON object with:
- modifiedPrompt: The improved system prompt
- reasoning: Brief explanation of your changes
- changes: Array of specific changes made

Focus on:
- Adding explicit context and definitions
- Including few-shot examples where helpful
- Adding chain-of-thought instructions for complex reasoning
- Clarifying output format with templates
- Adding step-by-step workflows

IMPORTANT: Respond ONLY with valid JSON, no other text.`;
  }

  private buildModificationPrompt(
    systemPrompt: string,
    examples: ProfileEntry[],
    failedEvaluations: EvaluationResult[]
  ): string {
    const examplesText = examples
      .slice(0, 5)
      .map(
        (e, i) =>
          `Example ${i + 1}:\nInput: ${e.input}\nExpected Output: ${e.output}`
      )
      .join("\n\n");

    const failuresText = failedEvaluations
      .slice(0, 5)
      .map(
        (e, i) =>
          `Failure ${i + 1} (score: ${e.score.toFixed(2)}):\nExpected: ${e.sourceOutput}\nGot: ${e.targetOutput}\nFeedback: ${e.feedback}`
      )
      .join("\n\n");

    return `**Current System Prompt:**
${systemPrompt}

**Expected Output Examples (Gold Standard):**
${examplesText}

**Failed Evaluations (Target Model):**
${failuresText}

Analyze the failures and improve the system prompt. Return valid JSON only.`;
  }

  /**
   * Generate a modified prompt based on evaluation failures
   */
  async modify(
    systemPrompt: string,
    examples: ProfileEntry[],
    failedEvaluations: EvaluationResult[]
  ): Promise<PromptModification> {
    const response = await this.model.invoke([
      new SystemMessage(this.buildSystemPrompt()),
      new HumanMessage(
        this.buildModificationPrompt(systemPrompt, examples, failedEvaluations)
      ),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Modifier did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const modification: PromptModification = {
      originalPrompt: systemPrompt,
      modifiedPrompt: parsed.modifiedPrompt,
      reasoning: parsed.reasoning,
      changes: parsed.changes ?? [],
      iteration: this.modifications.length + 1,
    };

    this.modifications.push(modification);
    return modification;
  }

  /**
   * Iteratively improve prompt until threshold is met or max iterations reached
   */
  async iterativeModify(
    systemPrompt: string,
    examples: ProfileEntry[],
    evaluateCallback: (prompt: string) => Promise<EvaluationResult[]>,
    threshold: number = 0.8
  ): Promise<PromptModification | null> {
    const maxIterations = this.config.maxIterations ?? 5;
    let currentPrompt = systemPrompt;

    for (let i = 0; i < maxIterations; i++) {
      const evaluations = await evaluateCallback(currentPrompt);
      const failedEvaluations = evaluations.filter((e) => !e.passed);
      const passRate = 1 - failedEvaluations.length / evaluations.length;

      if (passRate >= threshold) {
        return this.modifications[this.modifications.length - 1] ?? null;
      }

      if (failedEvaluations.length === 0) {
        break;
      }

      const modification = await this.modify(
        currentPrompt,
        examples,
        failedEvaluations
      );
      currentPrompt = modification.modifiedPrompt;
    }

    return this.modifications[this.modifications.length - 1] ?? null;
  }

  /**
   * Get modification history
   */
  get history(): PromptModification[] {
    return [...this.modifications];
  }

  /**
   * Clear modification history
   */
  clear(): void {
    this.modifications = [];
  }
}

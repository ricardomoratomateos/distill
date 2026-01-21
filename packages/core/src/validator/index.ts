import type {
  EvaluationResult,
  EvaluationSummary,
  ProfileEntry,
  ModelConfig,
} from "../types/index.js";
import { Judge, type JudgeConfig } from "../judge/index.js";

export interface ValidatorConfig {
  judge: JudgeConfig;
  threshold?: number;
  sampleSize?: number;
}

export interface ValidationInput {
  entries: ProfileEntry[];
  targetOutputs: Map<string, string>;
}

/**
 * Validator orchestrates the evaluation process
 * and provides summary statistics
 */
export class Validator {
  private judge: Judge;
  private config: ValidatorConfig;

  constructor(config: ValidatorConfig) {
    this.config = config;
    this.judge = new Judge(config.judge);
  }

  /**
   * Validate migrated outputs against source profiles
   */
  async validate(input: ValidationInput): Promise<EvaluationSummary> {
    const { entries, targetOutputs } = input;

    // Sample if needed
    const sampled = this.config.sampleSize
      ? this.sampleEntries(entries, this.config.sampleSize)
      : entries;

    const results: EvaluationResult[] = [];
    const categoryStats: Record<string, { total: number; passed: number; scores: number[] }> = {};

    for (const entry of sampled) {
      const targetOutput = targetOutputs.get(entry.id);
      if (!targetOutput) {
        console.warn(`No target output found for entry ${entry.id}`);
        continue;
      }

      const result = await this.judge.evaluate(
        entry.id,
        entry.input,
        entry.output,
        targetOutput
      );
      results.push(result);

      // Track category stats
      const category = entry.category ?? "default";
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, passed: 0, scores: [] };
      }
      categoryStats[category].total++;
      categoryStats[category].scores.push(result.score);
      if (result.passed) {
        categoryStats[category].passed++;
      }
    }

    return this.summarize(results, categoryStats);
  }

  /**
   * Quick validation on a subset of entries
   */
  async quickValidate(
    input: ValidationInput,
    sampleSize: number = 10
  ): Promise<EvaluationSummary> {
    const sampled = this.sampleEntries(input.entries, sampleSize);
    return this.validate({
      entries: sampled,
      targetOutputs: input.targetOutputs,
    });
  }

  private sampleEntries(entries: ProfileEntry[], size: number): ProfileEntry[] {
    if (entries.length <= size) {
      return entries;
    }

    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }

  private summarize(
    results: EvaluationResult[],
    categoryStats: Record<string, { total: number; passed: number; scores: number[] }>
  ): EvaluationSummary {
    if (results.length === 0) {
      return {
        totalEntries: 0,
        passedEntries: 0,
        averageScore: 0,
        results: [],
      };
    }

    const passedEntries = results.filter((r) => r.passed).length;
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);

    // Build category summary
    const byCategory: Record<string, { total: number; passed: number; avgScore: number }> = {};
    for (const [category, stats] of Object.entries(categoryStats)) {
      byCategory[category] = {
        total: stats.total,
        passed: stats.passed,
        avgScore: stats.scores.length > 0
          ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
          : 0,
      };
    }

    return {
      totalEntries: results.length,
      passedEntries,
      averageScore: totalScore / results.length,
      results,
      byCategory: Object.keys(byCategory).length > 1 ? byCategory : undefined,
    };
  }

  /**
   * Check if validation passes overall threshold
   */
  passes(summary: EvaluationSummary): boolean {
    const threshold = this.config.threshold ?? 0.8;
    return summary.averageScore >= threshold;
  }

  /**
   * Generate human-readable report
   */
  generateReport(summary: EvaluationSummary): string {
    const passRate = summary.totalEntries > 0
      ? (summary.passedEntries / summary.totalEntries) * 100
      : 0;

    let report = `# Validation Report\n\n`;
    report += `## Summary\n`;
    report += `- Total entries evaluated: ${summary.totalEntries}\n`;
    report += `- Passed entries: ${summary.passedEntries}\n`;
    report += `- Pass rate: ${passRate.toFixed(1)}%\n`;
    report += `- Average score: ${summary.averageScore.toFixed(3)}\n`;

    // Category breakdown
    if (summary.byCategory) {
      report += `\n## By Category\n`;
      for (const [category, stats] of Object.entries(summary.byCategory)) {
        const catPassRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        report += `- **${category}**: ${catPassRate.toFixed(0)}% (${stats.passed}/${stats.total}), avg: ${stats.avgScore.toFixed(2)}\n`;
      }
    }

    // Failed evaluations
    const failed = summary.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      report += `\n## Failed Evaluations (${failed.length})\n\n`;
      for (const result of failed.slice(0, 5)) {
        report += `### Entry: ${result.entryId}\n`;
        report += `- Score: ${result.score.toFixed(3)}\n`;
        report += `- Feedback: ${result.feedback}\n\n`;
      }
      if (failed.length > 5) {
        report += `... and ${failed.length - 5} more failures\n`;
      }
    }

    return report;
  }
}

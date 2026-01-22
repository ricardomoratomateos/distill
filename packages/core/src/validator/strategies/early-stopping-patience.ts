import type { ConvergenceStrategy, ConvergenceDecision, IterationHistory } from './types.js';
import type { MigrationState } from '../state.js';

export interface EarlyStoppingConfig {
  patience: number; // Number of iterations without improvement before stopping
  minImprovement?: number; // Minimum improvement to reset patience (default: 0.01 = 1%)
}

/**
 * Stops early if no improvement for N iterations
 *
 * Strategy: Stop if success rate doesn't improve for `patience` consecutive iterations
 *
 * Example (patience=3, minImprovement=0.01):
 * - Iteration 1: 50% → best=50%, patience=3
 * - Iteration 2: 75% → best=75%, patience=3 (improved by 25%)
 * - Iteration 3: 76% → best=76%, patience=3 (improved by 1%)
 * - Iteration 4: 75.5% → best=76%, patience=2 (no improvement >= 1%)
 * - Iteration 5: 75% → best=76%, patience=1
 * - Iteration 6: 74% → best=76%, patience=0 → STOP
 * - Returns: iteration 3 with 76%
 *
 * CRITICAL: Never exceeds maxIterations
 */
export class EarlyStoppingWithPatienceStrategy implements ConvergenceStrategy {
  readonly name = 'EarlyStoppingWithPatience';
  private config: Required<EarlyStoppingConfig>;
  private history: IterationHistory[] = [];
  private bestSuccessRate: number = 0;
  private patienceCounter: number = 0;

  constructor(config: EarlyStoppingConfig) {
    this.config = {
      patience: config.patience,
      minImprovement: config.minImprovement ?? 0.01,
    };
  }

  initialize(state: typeof MigrationState.State): void {
    this.history = [];
    this.bestSuccessRate = 0;
    this.patienceCounter = this.config.patience;
    console.log(`   Strategy: ${this.name} - patience=${this.config.patience}, minImprovement=${this.config.minImprovement}`);
  }

  shouldContinue(state: typeof MigrationState.State): ConvergenceDecision {
    // Track this iteration
    this.history.push({
      iteration: state.iteration,
      successRate: state.successRate,
      prompt: state.currentPrompt,
      testResults: state.testResults,
    });

    // Check if we improved
    const improvement = state.successRate - this.bestSuccessRate;

    if (improvement >= this.config.minImprovement) {
      // Significant improvement - reset patience
      this.bestSuccessRate = state.successRate;
      this.patienceCounter = this.config.patience;
    } else {
      // No significant improvement - decrease patience
      this.patienceCounter--;
    }

    // Check if we should stop
    if (this.patienceCounter <= 0) {
      return {
        shouldContinue: false,
        reason: `No improvement for ${this.config.patience} iterations`,
      };
    }

    // CRITICAL: Never exceed maxIterations
    if (state.iteration >= state.maxIterations) {
      return {
        shouldContinue: false,
        reason: `Reached maxIterations (${state.maxIterations})`,
      };
    }

    return {
      shouldContinue: true,
      reason: `Patience remaining: ${this.patienceCounter}/${this.config.patience}`,
    };
  }

  getBestResult(state: typeof MigrationState.State) {
    // Find the iteration with highest success rate
    const best = this.history.reduce((best, current) =>
      current.successRate > best.successRate ? current : best
    );

    console.log(`   Best found: iteration ${best.iteration} with ${(best.successRate * 100).toFixed(1)}%`);
    console.log(`   Stopped early after ${this.history.length} iterations (max was ${state.maxIterations})`);

    return {
      prompt: best.prompt,
      successRate: best.successRate,
      iteration: best.iteration,
    };
  }
}

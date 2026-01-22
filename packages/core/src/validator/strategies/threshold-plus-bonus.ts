import type { ConvergenceStrategy, ConvergenceDecision, IterationHistory } from './types.js';
import type { MigrationState } from '../state.js';

export interface ThresholdPlusBonusConfig {
  bonusRounds: number; // Extra iterations after reaching threshold
}

/**
 * Gives bonus rounds after reaching threshold
 *
 * Strategy: When threshold is reached, grant extra iterations to potentially improve further
 *
 * Example (bonusRounds=2, threshold=0.75, maxIterations=5):
 *
 * Case 1: Reaches threshold early
 * - Iteration 1: 50%
 * - Iteration 2: 75% ✓ (threshold reached! Activate bonus)
 * - bonusAvailable = min(2, 5-2) = min(2, 3) = 2
 * - Iteration 3: 80% (bonus 1/2)
 * - Iteration 4: 85% (bonus 2/2) → STOP
 * - Returns: best found (iteration 4 with 85%)
 *
 * Case 2: Reaches threshold late
 * - Iteration 1: 50%
 * - Iteration 2: 60%
 * - Iteration 3: 70%
 * - Iteration 4: 75% ✓ (threshold reached at iter 4)
 * - bonusAvailable = min(2, 5-4) = min(2, 1) = 1 (can only do 1 more)
 * - Iteration 5: 78% (bonus 1/1) → STOP (maxIterations)
 * - Returns: best found (iteration 5 with 78%)
 *
 * Case 3: Never reaches threshold
 * - Runs until maxIterations
 * - Returns: best found even if below threshold
 *
 * CRITICAL: NEVER exceeds maxIterations
 */
export class ThresholdPlusBonusRoundsStrategy implements ConvergenceStrategy {
  readonly name = 'ThresholdPlusBonusRounds';
  private config: ThresholdPlusBonusConfig;
  private history: IterationHistory[] = [];
  private thresholdReachedAt: number | null = null;
  private bonusRoundsUsed: number = 0;
  private bonusRoundsAvailable: number = 0;

  constructor(config: ThresholdPlusBonusConfig) {
    this.config = config;
  }

  initialize(state: typeof MigrationState.State): void {
    this.history = [];
    this.thresholdReachedAt = null;
    this.bonusRoundsUsed = 0;
    this.bonusRoundsAvailable = 0;
    console.log(`   Strategy: ${this.name} - bonusRounds=${this.config.bonusRounds} after threshold`);
  }

  shouldContinue(state: typeof MigrationState.State): ConvergenceDecision {
    // Track this iteration
    this.history.push({
      iteration: state.iteration,
      successRate: state.successRate,
      prompt: state.currentPrompt,
      testResults: state.testResults,
    });

    // Check if we just reached threshold
    if (this.thresholdReachedAt === null && state.successRate >= state.threshold) {
      this.thresholdReachedAt = state.iteration;

      // Calculate how many bonus rounds we can actually give
      // CRITICAL: Never exceed maxIterations
      const remainingIterations = state.maxIterations - state.iteration;
      this.bonusRoundsAvailable = Math.min(this.config.bonusRounds, remainingIterations);

      console.log(`   ✓ Threshold reached at iteration ${this.thresholdReachedAt}`);
      console.log(`   Granting ${this.bonusRoundsAvailable} bonus rounds (requested ${this.config.bonusRounds}, remaining ${remainingIterations})`);
    }

    // If we've reached threshold, count bonus rounds
    if (this.thresholdReachedAt !== null) {
      const iterationsSinceThreshold = state.iteration - this.thresholdReachedAt;

      if (iterationsSinceThreshold >= this.bonusRoundsAvailable) {
        return {
          shouldContinue: false,
          reason: `Completed ${this.bonusRoundsAvailable} bonus rounds after threshold`,
        };
      }

      return {
        shouldContinue: true,
        reason: `Bonus round ${iterationsSinceThreshold + 1}/${this.bonusRoundsAvailable}`,
      };
    }

    // Haven't reached threshold yet
    // CRITICAL: Never exceed maxIterations
    if (state.iteration >= state.maxIterations) {
      return {
        shouldContinue: false,
        reason: `Reached maxIterations (${state.maxIterations}) without hitting threshold`,
      };
    }

    return {
      shouldContinue: true,
      reason: `Seeking threshold (${(state.successRate * 100).toFixed(1)}% < ${(state.threshold * 100).toFixed(1)}%)`,
    };
  }

  getBestResult(state: typeof MigrationState.State) {
    // Find the iteration with highest success rate
    const best = this.history.reduce((best, current) =>
      current.successRate > best.successRate ? current : best
    );

    console.log(`   Best found: iteration ${best.iteration} with ${(best.successRate * 100).toFixed(1)}%`);

    if (this.thresholdReachedAt !== null) {
      console.log(`   Threshold reached at iteration ${this.thresholdReachedAt}, used ${this.bonusRoundsAvailable} bonus rounds`);
    } else {
      console.log(`   Threshold never reached, returning best attempt`);
    }

    return {
      prompt: best.prompt,
      successRate: best.successRate,
      iteration: best.iteration,
    };
  }
}

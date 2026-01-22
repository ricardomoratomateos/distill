import type { ConvergenceStrategy, ConvergenceDecision, IterationHistory } from './types.js';
import type { MigrationState } from '../state.js';

/**
 * Always runs until maxIterations, tracking the best result
 *
 * Strategy: Never stop early, always explore all iterations to find the best
 *
 * Example:
 * - maxIterations: 5
 * - Iteration 1: 50%
 * - Iteration 2: 75% ✓ (passes, but keep going)
 * - Iteration 3: 90% ✓ (better!)
 * - Iteration 4: 85% ✓ (worse, but track it)
 * - Iteration 5: 95% ✓ (best!)
 * - Returns: iteration 5 with 95%
 */
export class AlwaysRunMaxStrategy implements ConvergenceStrategy {
  readonly name = 'AlwaysRunMax';
  private history: IterationHistory[] = [];

  initialize(state: typeof MigrationState.State): void {
    this.history = [];
    console.log(`   Strategy: ${this.name} - will run all ${state.maxIterations} iterations`);
  }

  shouldContinue(state: typeof MigrationState.State): ConvergenceDecision {
    // Track this iteration
    this.history.push({
      iteration: state.iteration,
      successRate: state.successRate,
      prompt: state.currentPrompt,
      testResults: state.testResults,
    });

    // Always continue until maxIterations
    if (state.iteration < state.maxIterations) {
      return {
        shouldContinue: true,
        reason: `Running all iterations (${state.iteration}/${state.maxIterations})`,
      };
    }

    // Reached max
    return {
      shouldContinue: false,
      reason: `Completed all ${state.maxIterations} iterations`,
    };
  }

  getBestResult(state: typeof MigrationState.State) {
    // Find the iteration with highest success rate
    const best = this.history.reduce((best, current) =>
      current.successRate > best.successRate ? current : best
    );

    console.log(`   Best found: iteration ${best.iteration} with ${(best.successRate * 100).toFixed(1)}%`);

    return {
      prompt: best.prompt,
      successRate: best.successRate,
      iteration: best.iteration,
    };
  }
}

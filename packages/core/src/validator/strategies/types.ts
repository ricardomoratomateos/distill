import type { MigrationState } from '../state.js';

/**
 * History entry for tracking best results
 */
export interface IterationHistory {
  iteration: number;
  successRate: number;
  prompt: string;
  testResults: any[];
}

/**
 * Decision from a convergence strategy
 */
export interface ConvergenceDecision {
  shouldContinue: boolean;
  reason: string;
}

/**
 * Base interface for convergence strategies
 */
export interface ConvergenceStrategy {
  /**
   * Called at the start of migration
   */
  initialize(state: typeof MigrationState.State): void;

  /**
   * Called after each test iteration to decide whether to continue
   */
  shouldContinue(state: typeof MigrationState.State): ConvergenceDecision;

  /**
   * Called when migration ends to get the best result
   */
  getBestResult(state: typeof MigrationState.State): {
    prompt: string;
    successRate: number;
    iteration: number;
  };

  /**
   * Strategy name for logging
   */
  readonly name: string;
}

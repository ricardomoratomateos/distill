import { createMigrationGraph } from './graph.js';
import type { AgentConfig, TestSuite } from '../types/index.js';
import type { ConvergenceStrategy } from './strategies/index.js';
import { ThresholdPlusBonusRoundsStrategy } from './strategies/index.js';

export interface ValidatorConfig {
  threshold?: number;      // Success rate needed (0-1), default: 0.95
  maxIterations?: number;  // Max iterations, default: 10
  strategy?: ConvergenceStrategy; // Convergence strategy, default: ThresholdPlusBonusRounds(2)
}

export interface MigrationResult {
  success: boolean;
  iterations: number;
  finalSuccessRate: number;
  finalPrompt: string;
  originalPrompt: string;
}

export class Validator {
  private config: Required<ValidatorConfig>;

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 0.95,
      maxIterations: config.maxIterations ?? 10,
      strategy: config.strategy ?? new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
    };
  }

  async migrate(
    sourceConfig: AgentConfig,
    targetConfig: AgentConfig,
    testSuite: TestSuite
  ): Promise<MigrationResult> {
    console.log('🚀 Starting migration...\n');
    console.log(`Source: ${sourceConfig.model.name}`);
    console.log(`Target: ${targetConfig.model.name}`);
    console.log(`Threshold: ${(this.config.threshold! * 100).toFixed(0)}%`);
    console.log(`Max iterations: ${this.config.maxIterations}`);
    
    const graph = createMigrationGraph();
    
    const result = await graph.invoke(
      {
        sourceConfig,
        targetConfig,
        testSuite,
        threshold: this.config.threshold,
        maxIterations: this.config.maxIterations,
        strategy: this.config.strategy,
        currentPrompt: targetConfig.systemPrompt,
        iteration: 0,
        testResults: [],
        successRate: 0,
        converged: false,
        finalPrompt: null,
      },
      {
        recursionLimit: 100, // Allow up to 100 steps (maxIterations * 4 nodes per iteration + buffer)
      }
    );
    
    return {
      success: result.converged,
      iterations: result.iteration,
      finalSuccessRate: result.successRate,
      finalPrompt: result.finalPrompt || targetConfig.systemPrompt,
      originalPrompt: targetConfig.systemPrompt,
    };
  }
}

export * from './state.js';
export * from './graph.js';
export * from './nodes.js';
export * from './strategies/index.js';
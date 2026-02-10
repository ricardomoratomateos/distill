import { createMigrationGraph } from './graph.js';
import type { AgentConfig, TestSuite } from '../types/index.js';
import type { ConvergenceStrategy } from './strategies/index.js';
import { ThresholdPlusBonusRoundsStrategy } from './strategies/index.js';

export interface IterationProgress {
  iteration: number;
  successRate: number;
  currentPrompt: string;
}

export interface ValidatorConfig {
  threshold?: number;      // Success rate needed (0-1), default: 0.95
  maxIterations?: number;  // Max iterations, default: 10
  strategy?: ConvergenceStrategy; // Convergence strategy, default: ThresholdPlusBonusRounds(2)
  judgeContext?: string;   // Domain context for the judge evaluator
  onIteration?: (progress: IterationProgress) => Promise<void> | void;
}

export interface MigrationResult {
  success: boolean;
  iterations: number;
  finalSuccessRate: number;
  finalPrompt: string;
  originalPrompt: string;
}

export class Validator {
  private config: Required<Omit<ValidatorConfig, 'onIteration' | 'judgeContext'>>;
  private judgeContext?: string;
  private onIteration?: ValidatorConfig['onIteration'];

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 0.95,
      maxIterations: config.maxIterations ?? 10,
      strategy: config.strategy ?? new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
    };
    this.judgeContext = config.judgeContext;
    this.onIteration = config.onIteration;
  }

  async migrate(
    sourceConfig: AgentConfig,
    targetConfig: AgentConfig,
    testSuite: TestSuite
  ): Promise<MigrationResult> {
    console.log('🚀 Starting migration...\n');
    console.log(`Source: ${sourceConfig.model.name}`);
    console.log(`Target: ${targetConfig.model.name}`);
    console.log(`Threshold: ${(this.config.threshold * 100).toFixed(0)}%`);
    console.log(`Max iterations: ${this.config.maxIterations}`);

    const graph = createMigrationGraph();

    const initialState = {
      sourceConfig,
      targetConfig,
      testSuite,
      threshold: this.config.threshold,
      maxIterations: this.config.maxIterations,
      strategy: this.config.strategy,
      judgeContext: this.judgeContext,
      currentPrompt: targetConfig.systemPrompt,
      iteration: 0,
      testResults: [],
      successRate: 0,
      converged: false,
      finalPrompt: null,
    };

    const stream = await graph.stream(initialState, {
      recursionLimit: 100,
      streamMode: "updates",
    });

    let finalState: any = initialState;
    let totalIterations = 0;

    for await (const chunk of stream) {
      const [nodeName, updates] = Object.entries(chunk)[0] as [string, any];

      // Capture iteration count from test node before check can overwrite it
      // (checkConvergence overwrites iteration with best.iteration on completion)
      if (nodeName === 'test' && updates.iteration !== undefined) {
        totalIterations = updates.iteration;
      }

      finalState = { ...finalState, ...updates };

      if (nodeName === 'check' && this.onIteration) {
        await this.onIteration({
          iteration: totalIterations,
          successRate: finalState.successRate,
          currentPrompt: finalState.currentPrompt,
        });
      }
    }

    return {
      success: finalState.converged,
      iterations: totalIterations,
      finalSuccessRate: finalState.successRate,
      finalPrompt: finalState.finalPrompt || targetConfig.systemPrompt,
      originalPrompt: targetConfig.systemPrompt,
    };
  }
}

export * from './state.js';
export * from './graph.js';
export * from './nodes.js';
export * from './strategies/index.js';
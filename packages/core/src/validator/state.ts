import type { TestSuite, TestResult, AgentConfig } from '../types/index.js';
import type { ConvergenceStrategy } from './strategies/index.js';
import { Annotation } from '@langchain/langgraph';

/**
 * State for the migration graph
 */
export const MigrationState = Annotation.Root({
  // Input
  sourceConfig: Annotation<AgentConfig>,
  targetConfig: Annotation<AgentConfig>,
  testSuite: Annotation<TestSuite>,

  // Configuration
  threshold: Annotation<number>,
  maxIterations: Annotation<number>,
  strategy: Annotation<ConvergenceStrategy>,
  judgeContext: Annotation<string | undefined>,

  // Progress
  iteration: Annotation<number>,
  currentPrompt: Annotation<string>,

  // Results
  testResults: Annotation<TestResult[]>,
  successRate: Annotation<number>,

  // Output
  converged: Annotation<boolean>,
  finalPrompt: Annotation<string | null>,
});
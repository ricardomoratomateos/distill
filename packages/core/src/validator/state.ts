import type { TestSuite, TestResult, AgentConfig } from '../types/index.js';
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
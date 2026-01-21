import type { AgentInput, AgentOutput, AgentTrace } from './agent.js';

/**
 * A single test case
 */
export interface TestCase {
  id: string;
  description: string;
  input: AgentInput;
  expectedOutput?: Partial<AgentOutput>;
  expectedBehavior?: string;
}

/**
 * A collection of test cases
 */
export interface TestSuite {
  id: string;
  name: string;
  description: string;
  agentName: string;
  testCases: TestCase[];
  createdAt: Date;
}

/**
 * Result of running a single test case
 */
export interface TestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: AgentOutput;
  trace: AgentTrace;
  evaluation?: EvaluationResult;
}

/**
 * Result of running entire test suite
 */
export interface TestSuiteResult {
  testSuiteId: string;
  agentName: string;
  modelUsed: string;
  testResults: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
    avgCost: number;
    avgLatency: number;
  };
  timestamp: Date;
}

/**
 * Evaluation from the Judge LLM
 */
export interface EvaluationResult {
  scores: {
    correctness: number;
    efficiency: number;
    robustness: number;
    reasoningQuality: number;
  };
  passed: boolean;
  reasoning: string;
  failures: string[];
  suggestions: string[];
}
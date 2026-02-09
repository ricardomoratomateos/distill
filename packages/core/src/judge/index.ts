import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { AgentConfig, TestCase, TestResult, EvaluationResult } from '../types/index.js';
import { buildJudgeEvaluationPrompt } from '../prompts/judge-evaluation.js';

export interface JudgeConfig {
  model: {
    provider: 'anthropic' | 'openai';
    name: string;
  };
  threshold?: number;
}

export class Judge {
  private model: ChatAnthropic | ChatOpenAI;
  private threshold: number;

  constructor(config: JudgeConfig) {
    this.threshold = config.threshold ?? 8;
    this.model = this.createModel(config.model);
  }

  private createModel(modelConfig: JudgeConfig['model']): ChatAnthropic | ChatOpenAI {
    switch (modelConfig.provider) {
      case 'anthropic':
        return new ChatAnthropic({
          modelName: modelConfig.name,
          temperature: 0,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });
      
      case 'openai':
        return new ChatOpenAI({
          modelName: modelConfig.name,
          temperature: 0,
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
  }

  async evaluate(testCase: TestCase, actualOutput: string): Promise<EvaluationResult> {
    const goldStandardOutput = testCase.expectedOutput?.response;
    
    if (!goldStandardOutput) {
      throw new Error('Test case missing expected output');
    }

    const evaluationPrompt = buildJudgeEvaluationPrompt({
      input: testCase.input.message,
      goldStandard: goldStandardOutput,
      actual: actualOutput,
      expectedBehavior: testCase.expectedBehavior,
      threshold: this.threshold,
    });

    try {
      const response = await this.model.invoke(evaluationPrompt);
      const evaluation = this.parseEvaluation(response.content as string);
      
      return evaluation;
    } catch (error) {
      throw new Error(`Judge evaluation failed: ${error}`);
    }
  }

  async evaluateBatch(
    testCases: TestCase[],
    actualOutputs: Map<string, string>,
    options?: { concurrency?: number }
  ): Promise<TestResult[]> {
    const concurrency = options?.concurrency ?? 3; // Default: 3 parallel evaluations
    const results: TestResult[] = [];

    // Helper function to process a single test case
    const processTestCase = async (testCase: TestCase): Promise<TestResult> => {
      const actualOutput = actualOutputs.get(testCase.id);

      if (!actualOutput) {
        throw new Error(`Missing actual output for test case ${testCase.id}`);
      }

      console.log(`   Evaluating: ${testCase.description}`);

      const evaluation = await this.evaluate(testCase, actualOutput);

      console.log(`      ${evaluation.passed ? '✓' : '✗'} Score: ${evaluation.scores.correctness}/10`);

      return {
        testCaseId: testCase.id,
        passed: evaluation.passed,
        actualOutput: { response: actualOutput },
        trace: {
          input: testCase.input,
          output: { response: actualOutput },
          tokensUsed: { input: 0, output: 0, total: 0 },
          latencyMs: 0,
          cost: 0,
          timestamp: new Date(),
          modelUsed: 'target-model',
        },
        evaluation,
      };
    };

    // Process in batches of 'concurrency' size
    for (let i = 0; i < testCases.length; i += concurrency) {
      const batch = testCases.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(processTestCase));
      results.push(...batchResults);
    }

    return results;
  }

  private parseEvaluation(response: string): EvaluationResult {
    try {
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\n?/g, '');
      }
      
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.scores || !parsed.reasoning) {
        throw new Error('Invalid evaluation response structure');
      }

      parsed.passed = Boolean(parsed.passed);
      parsed.failures = parsed.failures || [];
      parsed.suggestions = parsed.suggestions || [];

      return parsed as EvaluationResult;
      
    } catch (error) {
      throw new Error(`Failed to parse judge response: ${error}\nResponse was: ${response}`);
    }
  }
}
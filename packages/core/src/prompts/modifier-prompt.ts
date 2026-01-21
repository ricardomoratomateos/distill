import type { TestResult } from '../types/index.js';

export interface ModifierPromptParams {
  currentPrompt: string;
  failedTests: TestResult[];
  modelName: string;
}

export function buildModifierPrompt(params: ModifierPromptParams): string {
  const { currentPrompt, failedTests, modelName } = params;
  
  const failuresSummary = failedTests.map((test, i) => {
    const evaluation = test.evaluation!;
    return `
Test ${i + 1}:
Input: ${test.trace.input.message}
Expected: ${test.trace.output.response}
Actual: ${test.actualOutput.response}
Issues: ${evaluation.failures.join('; ')}
Suggestions: ${evaluation.suggestions.join('; ')}
`;
  }).join('\n');

  return `You are an expert at optimizing prompts for cheaper LLMs.

CURRENT SYSTEM PROMPT:
${currentPrompt}

TARGET MODEL: ${modelName}

FAILED TESTS (${failedTests.length}):
${failuresSummary}

Analyze the failures and provide an IMPROVED system prompt that:
1. Makes implicit instructions explicit
2. Adds examples for common patterns
3. Addresses specific failure modes
4. Maintains conciseness where possible

Respond with ONLY the improved prompt (no explanation, no markdown).`;
}
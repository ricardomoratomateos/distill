import type { TestResult } from '../types/index.js';

export interface ModifierPromptParams {
  currentPrompt: string;
  failedTests: TestResult[];
  modelName: string;
}

export function buildModifierPrompt(params: ModifierPromptParams): string {
  const { currentPrompt, failedTests, modelName } = params;

  // Abstract failure patterns - NO specific inputs/outputs
  const failurePatterns = failedTests.map((test, i) => {
    const evaluation = test.evaluation!;
    const inputLength = test.trace.input.message.length;
    const expectedLength = test.trace.output.response.length;
    const actualLength = test.actualOutput.response.length;

    // Classify question type without revealing content
    let questionType = 'general';
    if (inputLength < 30) questionType = 'simple';
    else if (test.trace.input.message.includes('one sentence')) questionType = 'concise_explanation';
    else if (inputLength > 50) questionType = 'complex';

    return `
Pattern ${i + 1} - ${questionType} question:
Length mismatch: Expected ~${expectedLength} chars, got ${actualLength} chars
Issues: ${evaluation.failures.join('; ')}
General guidance needed: ${evaluation.suggestions.join('; ')}
`;
  }).join('\n');

  return `You are an expert at optimizing prompts for cheaper LLMs.

CURRENT SYSTEM PROMPT:
${currentPrompt}

TARGET MODEL: ${modelName}

FAILURE PATTERNS OBSERVED (${failedTests.length}):
${failurePatterns}

Your task: Generate an IMPROVED system prompt that teaches GENERAL STRATEGIES.

CRITICAL RULES:
1. DO NOT include specific answers or example responses from the test cases
2. DO NOT memorize the test inputs - teach general approaches instead
3. Focus on TRANSFERABLE strategies (e.g., "match response length to question complexity")
4. Add guidelines for handling different TYPES of questions (simple, complex, concise explanations)
5. Use abstract examples if needed, but NEVER from the actual test cases

The improved prompt should help the model handle NEW questions, not just pass these specific tests.

Respond with ONLY the improved system prompt (no explanation, no markdown, no code blocks).`;
}
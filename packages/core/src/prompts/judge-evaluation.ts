export interface JudgePromptParams {
  input: string;
  goldStandard: string;
  actual: string;
  expectedBehavior?: string;
  threshold: number;
}

export function buildJudgeEvaluationPrompt(params: JudgePromptParams): string {
  const { input, goldStandard, actual, expectedBehavior, threshold } = params;
  
  return `You are an expert evaluator of AI agent outputs. Your job is to determine if a target output meets the quality standards of a gold standard output.

INPUT (user's original request):
${input}

GOLD STANDARD OUTPUT (from expensive model):
${goldStandard}

TARGET OUTPUT (from cheaper model being tested):
${actual}

${expectedBehavior ? `EXPECTED BEHAVIOR:\n${expectedBehavior}\n` : ''}

Evaluate the TARGET OUTPUT across these dimensions (score each 0-10):

1. CORRECTNESS: Is the target output factually correct? Does it achieve the same goal as the gold standard?
2. COMPLETENESS: Does the target include all important information from the gold standard?
3. QUALITY: Is the target output well-formed, clear, and professional?
4. CONSISTENCY: Does the target maintain the same tone and style as the gold standard?

Respond in this EXACT JSON format (no markdown, no extra text):
{
  "scores": {
    "correctness": <0-10>,
    "efficiency": <0-10>,
    "robustness": <0-10>,
    "reasoningQuality": <0-10>
  },
  "passed": <true/false>,
  "reasoning": "<brief explanation>",
  "failures": ["<specific issue 1>", "<specific issue 2>"],
  "suggestions": ["<improvement 1>", "<improvement 2>"]
}

Guidelines:
- Be strict but fair
- Focus on semantic equivalence, not exact wording
- Minor stylistic differences are acceptable
- Missing critical information = failure
- Hallucinations or incorrect facts = failure
- passed = true only if ALL scores >= ${threshold}`;
}
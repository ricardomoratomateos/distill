import { Profiler } from '../profiler/index.js';
import { Judge } from '../judge/index.js';
import { SingleAgent } from '../agents/single-agent.js';
import type { AgentConfig } from '../types/index.js';

// Config para modelo caro (gold standard)
const expensiveConfig: AgentConfig = {
  name: 'Expensive Agent',
  description: 'Using Claude Sonnet',
  
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  
  systemPrompt: 'You are a helpful assistant. Answer concisely and accurately.',
  
  objective: 'Answer questions correctly',
  successCriteria: ['Accurate', 'Concise'],
};

// Config para modelo barato
const cheapConfig: AgentConfig = {
  ...expensiveConfig,
  name: 'Cheap Agent',
  description: 'Using GPT-4o-mini',
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },
};

async function test() {
  console.log('🧪 Testing Judge\n');
  
  // Step 1: Profile expensive model (gold standard)
  console.log('📊 Step 1: Profiling expensive model...');
  const profiler = new Profiler({ agentConfig: expensiveConfig });
  
  const testInputs = [
    { message: 'What is 2+2?' },
    { message: 'What is the capital of France?' },
    { message: 'Explain photosynthesis in one sentence.' },
  ];
  
  const testSuite = await profiler.profile(testInputs);
  console.log(`✅ Gold standard captured: ${testSuite.testCases.length} test cases\n`);
  
  // Step 2: Run cheap model on same inputs
  console.log('💰 Step 2: Running cheap model...');
  const cheapAgent = new SingleAgent(cheapConfig);
  const actualOutputs = new Map<string, string>();
  
  for (const testCase of testSuite.testCases) {
    const output = await cheapAgent.execute(testCase.input);
    actualOutputs.set(testCase.id, output.response);
    console.log(`   ✓ ${testCase.input.message}`);
  }
  console.log('');
  
  // Step 3: Judge evaluates cheap model vs gold standard
  console.log('⚖️  Step 3: Judge evaluation...');
  const judge = new Judge({
    model: {
      provider: 'anthropic',
      name: 'claude-sonnet-4-20250514', // Use expensive model as judge
    },
    threshold: 7, // Pass if score >= 7/10
  });
  
  const results = await judge.evaluateBatch(testSuite.testCases, actualOutputs);
  
  // Step 4: Summary
  console.log('\n📋 RESULTS:\n');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach((result, i) => {
    const testCase = testSuite.testCases[i];
    const evaluation = result.evaluation!;
    
    console.log(`Test ${i + 1}: ${testCase.input.message}`);
    console.log(`   Gold:   ${testCase.expectedOutput?.response}`);
    console.log(`   Actual: ${result.actualOutput.response}`);
    console.log(`   Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Scores: Correctness=${evaluation.scores.correctness}/10`);
    console.log(`   Reason: ${evaluation.reasoning}`);
    if (evaluation.failures.length > 0) {
      console.log(`   Issues: ${evaluation.failures.join(', ')}`);
    }
    console.log('');
  });
  
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Success Rate: ${passed}/${total} (${(passed/total*100).toFixed(1)}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

test().catch(console.error);
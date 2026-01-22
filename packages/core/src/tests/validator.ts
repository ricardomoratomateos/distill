import { Profiler } from '../profiler/index.js';
import { Validator, ThresholdPlusBonusRoundsStrategy } from '../validator/index.js';
import type { AgentConfig } from '../types/index.js';

// Modelo caro (gold standard)
const sourceConfig: AgentConfig = {
  name: 'Claude Sonnet (Expensive)',
  description: 'High-quality expensive model',

  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },

  systemPrompt: 'You are a helpful assistant. Answer questions accurately and concisely.',

  objective: 'Provide accurate and helpful answers',
  successCriteria: ['Accurate', 'Concise', 'Helpful'],
};

// Modelo barato (a optimizar)
const targetConfig: AgentConfig = {
  name: 'GPT-4o-mini (Cheap)',
  description: 'Cost-effective model to optimize',

  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },

  // Initial basic prompt (suboptimal)
  systemPrompt: 'Answer the question.',

  objective: 'Provide accurate and helpful answers',
  successCriteria: ['Accurate', 'Concise', 'Helpful'],
};

async function test() {
  console.log('🧪 Testing Validator (Full Migration)\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: Profile expensive model to create gold standard
  console.log('📊 Step 1: Profiling expensive model (gold standard)...\n');
  const profiler = new Profiler({ agentConfig: sourceConfig });

  const testInputs = [
    { message: 'What is 2+2?' },
    { message: 'What is the capital of France?' },
    { message: 'Explain photosynthesis in one sentence.' },
    { message: 'What is the Pythagorean theorem?' },
  ];

  const testSuite = await profiler.profile(testInputs);
  console.log(`\n✅ Gold standard created: ${testSuite.testCases.length} test cases\n`);

  // Show gold standard examples
  console.log('Gold Standard Examples:');
  testSuite.testCases.forEach((tc, i) => {
    console.log(`  ${i + 1}. Q: ${tc.input.message}`);
    console.log(`     A: ${tc.expectedOutput?.response}\n`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 2: Run migration with validator
  console.log('🔄 Step 2: Starting migration...\n');
  console.log(`Initial prompt: "${targetConfig.systemPrompt}"\n`);

  const validator = new Validator({
    threshold: 0.75, // 75% success rate needed
    maxIterations: 5,
    strategy: new ThresholdPlusBonusRoundsStrategy({ bonusRounds: 2 }),
  });

  const result = await validator.migrate(sourceConfig, targetConfig, testSuite);

  // Step 3: Show results
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 MIGRATION RESULTS\n');
  console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Iterations: ${result.iterations}/${validator['config'].maxIterations}`);
  console.log(`Final Success Rate: ${(result.finalSuccessRate * 100).toFixed(1)}%`);
  console.log(`Target Success Rate: ${(validator['config'].threshold! * 100).toFixed(1)}%`);
  console.log('');

  console.log('Original Prompt:');
  console.log(`  "${result.originalPrompt}"`);
  console.log('');

  console.log('Final Optimized Prompt:');
  console.log(`  "${result.finalPrompt}"`);
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (result.success) {
    console.log('\n🎉 Migration successful! The cheap model now matches the expensive model.');
  } else {
    console.log('\n⚠️  Migration did not fully converge. Consider:');
    console.log('   - Increasing maxIterations');
    console.log('   - Lowering the threshold');
    console.log('   - Using a more capable target model');
  }
}

test().catch(console.error);

import { Profiler } from '../profiler/index.js';
import { Judge } from '../judge/index.js';
import { Modifier } from '../modifier/index.js';
import { SingleAgent } from '../agents/single-agent.js';
import type { AgentConfig } from '../types/index.js';

// Modelo caro (gold standard)
const expensiveConfig: AgentConfig = {
  name: 'Expensive Agent',
  description: 'Claude Sonnet',
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  systemPrompt: 'You are a helpful assistant. Be concise.',
  objective: 'Answer correctly and concisely',
  successCriteria: ['Accurate', 'Brief'],
};

// Modelo barato (a optimizar)
const cheapConfig: AgentConfig = {
  ...expensiveConfig,
  name: 'Cheap Agent',
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },
};

async function test() {
  console.log('🚀 FULL MIGRATION TEST\n');
  
  // STEP 1: Profile (gold standard)
  console.log('📊 STEP 1: Profiling expensive model...');
  const profiler = new Profiler({ agentConfig: expensiveConfig });
  const testSuite = await profiler.profile([
    { message: 'What is 2+2?' },
    { message: 'Explain photosynthesis in one sentence.' },
  ]);
  console.log('');
  
  // STEP 2: Test cheap model (baseline)
  console.log('💰 STEP 2: Testing cheap model (baseline)...');
  let cheapAgent = new SingleAgent(cheapConfig);
  let actualOutputs = new Map<string, string>();
  
  for (const tc of testSuite.testCases) {
    const output = await cheapAgent.execute(tc.input);
    actualOutputs.set(tc.id, output.response);
  }
  console.log('');
  
  // STEP 3: Judge evaluation
  console.log('⚖️  STEP 3: Judge evaluation (baseline)...');
  const judge = new Judge({
    model: { provider: 'anthropic', name: 'claude-sonnet-4-20250514' },
    threshold: 7,
  });
  
  let results = await judge.evaluateBatch(testSuite.testCases, actualOutputs);
  let passed = results.filter(r => r.passed).length;
  console.log(`   Result: ${passed}/${results.length} passed (${(passed/results.length*100).toFixed(0)}%)\n`);
  
  // STEP 4: Modifier (if needed)
  if (passed < results.length) {
    console.log('🔧 STEP 4: Generating improved prompt...');
    const modifier = new Modifier({
      model: { provider: 'anthropic', name: 'claude-sonnet-4-20250514' },
    });
    
    const failed = results.filter(r => !r.passed);
    const improvedPrompt = await modifier.modify(
      cheapConfig.systemPrompt,
      failed,
      'gpt-4o-mini'
    );
    
    console.log('\n📝 IMPROVED PROMPT:');
    console.log('━'.repeat(60));
    console.log(improvedPrompt);
    console.log('━'.repeat(60));
    console.log('');
    
    // STEP 5: Test with improved prompt
    console.log('🔄 STEP 5: Testing with improved prompt...');
    
    // Update config with improved prompt
    cheapConfig.systemPrompt = improvedPrompt;
    cheapAgent = new SingleAgent(cheapConfig);
    
    // Re-test
    actualOutputs = new Map<string, string>();
    for (const tc of testSuite.testCases) {
      const output = await cheapAgent.execute(tc.input);
      actualOutputs.set(tc.id, output.response);
      console.log(`   ✓ ${tc.input.message}`);
    }
    console.log('');
    
    // Re-evaluate
    console.log('⚖️  Judge evaluation (after improvement)...');
    results = await judge.evaluateBatch(testSuite.testCases, actualOutputs);
    passed = results.filter(r => r.passed).length;
    console.log(`   Result: ${passed}/${results.length} passed (${(passed/results.length*100).toFixed(0)}%)\n`);
    
    // Final result
    console.log('━'.repeat(60));
    if (passed === results.length) {
      console.log('🎉 MIGRATION SUCCESSFUL!');
      console.log(`   Baseline: ${results.length - passed} failed`);
      console.log(`   After optimization: All tests passed ✓`);
    } else {
      console.log('⚠️  MIGRATION INCOMPLETE');
      console.log(`   Still ${results.length - passed} tests failing`);
      console.log(`   (Would continue iterating in Validator)`);
    }
    console.log('━'.repeat(60));
  } else {
    console.log('✅ All tests passed! No modification needed.');
  }
}

test().catch(console.error);
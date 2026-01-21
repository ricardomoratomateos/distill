import { Profiler } from '../profiler/index.js';
import { Judge } from '../judge/index.js';
import { SingleAgent } from '../agents/single-agent.js';
import type { AgentConfig } from '../types/index.js';

const expensiveConfig: AgentConfig = {
  name: 'Expensive Agent',
  description: 'Claude Sonnet',
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  systemPrompt: 'You are a helpful assistant. Be concise.',
  objective: 'Answer correctly',
  successCriteria: ['Accurate', 'Brief'],
};

// Cheap model con prompt MEJORADO
const improvedConfig: AgentConfig = {
  ...expensiveConfig,
  name: 'Improved Cheap Agent',
  model: {
    provider: 'openai',
    name: 'gpt-4o-mini',
    temperature: 0,
  },
  systemPrompt: 'You are a helpful assistant. Be concise and direct. When asked to explain something "in one sentence," provide a simple, clear sentence that covers the core concept without excessive detail or multiple clauses. Focus on the most essential information rather than comprehensive coverage.',
};

async function test() {
  console.log('✨ Testing IMPROVED prompt\n');
  
  // Step 1: Profile
  const profiler = new Profiler({ agentConfig: expensiveConfig });
  const testSuite = await profiler.profile([
    { message: 'What is 2+2?' },
    { message: 'Explain photosynthesis in one sentence.' },
  ]);
  console.log('');
  
  // Step 2: Test with IMPROVED prompt
  console.log('🔧 Testing with IMPROVED prompt...');
  const improvedAgent = new SingleAgent(improvedConfig);
  const outputs = new Map<string, string>();
  
  for (const tc of testSuite.testCases) {
    const output = await improvedAgent.execute(tc.input);
    outputs.set(tc.id, output.response);
    console.log(`   ✓ ${tc.input.message}`);
  }
  console.log('');
  
  // Step 3: Judge
  console.log('⚖️  Judge evaluation...');
  const judge = new Judge({
    model: { provider: 'anthropic', name: 'claude-sonnet-4-20250514' },
    threshold: 7,
  });
  
  const results = await judge.evaluateBatch(testSuite.testCases, outputs);
  const passed = results.filter(r => r.passed).length;
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✨ RESULT: ${passed}/${results.length} passed (${passed/results.length*100}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  if (passed === results.length) {
    console.log('🎉 SUCCESS! Improved prompt works perfectly!');
  }
}

test().catch(console.error);
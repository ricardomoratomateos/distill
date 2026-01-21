import { Profiler } from '../profiler/index.js';
import type { AgentConfig } from '../types/index.js';

const testConfig: AgentConfig = {
  name: 'Test Agent',
  description: 'Simple test agent',
  
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  
  systemPrompt: 'You are a helpful assistant. Answer concisely.',
  
  objective: 'Answer questions correctly',
  successCriteria: ['Accurate', 'Concise'],
};

async function test() {
  const profiler = new Profiler({ agentConfig: testConfig });
  
  const testSuite = await profiler.profile([
    { message: 'What is 2+2?' },
    { message: 'What is the capital of France?' },
    { message: 'What color is the sky?' },
  ]);
  
  console.log('\n📊 Test Suite Generated:');
  console.log(`   ID: ${testSuite.id}`);
  console.log(`   Test cases: ${testSuite.testCases.length}`);
  
  testSuite.testCases.forEach((tc, i) => {
    console.log(`\n   Test ${i + 1}:`);
    console.log(`   Input: ${tc.input.message}`);
    console.log(`   Output: ${tc.expectedOutput?.response}`);
  });
}

test().catch(console.error);
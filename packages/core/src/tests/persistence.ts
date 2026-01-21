import { Profiler } from '../profiler/index.js';
import { saveTestSuite, loadTestSuite, generateTestSuiteFilename } from '../utils/persistence.js';
import type { AgentConfig } from '../types/index.js';
import { join } from 'path';

const testConfig: AgentConfig = {
  name: 'Persistence Test Agent',
  description: 'Testing save/load functionality',
  
  model: {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    temperature: 0,
  },
  
  systemPrompt: 'You are a helpful assistant.',
  
  objective: 'Answer correctly',
  successCriteria: ['Accurate'],
};

async function test() {
  console.log('💾 Testing Persistence\n');
  
  // Step 1: Create a test suite
  console.log('📊 Step 1: Creating test suite...');
  const profiler = new Profiler({ agentConfig: testConfig });
  
  const testSuite = await profiler.profile([
    { message: 'What is 1+1?' },
    { message: 'What color is grass?' },
  ]);
  
  console.log(`✅ Test suite created with ${testSuite.testCases.length} cases\n`);
  
  // Step 2: Save to file
  console.log('💾 Step 2: Saving to file...');
  const filename = generateTestSuiteFilename(testConfig.name);
  const filepath = join(process.cwd(), 'profiles', filename);
  
  await saveTestSuite(testSuite, filepath);
  console.log('');
  
  // Step 3: Load from file
  console.log('📂 Step 3: Loading from file...');
  const loaded = await loadTestSuite(filepath);
  console.log('');
  
  // Step 4: Verify
  console.log('✅ Step 4: Verification');
  console.log(`   Original ID: ${testSuite.id}`);
  console.log(`   Loaded ID:   ${loaded.id}`);
  console.log(`   Match: ${testSuite.id === loaded.id ? '✓' : '✗'}`);
  console.log('');
  console.log(`   Original cases: ${testSuite.testCases.length}`);
  console.log(`   Loaded cases:   ${loaded.testCases.length}`);
  console.log(`   Match: ${testSuite.testCases.length === loaded.testCases.length ? '✓' : '✗'}`);
  console.log('');
  
  console.log('📁 Saved to:', filepath);
}

test().catch(console.error);
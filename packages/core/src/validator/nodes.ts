import { SingleAgent } from '../agents/single-agent.js';
import { Judge } from '../judge/index.js';
import { Modifier } from '../modifier/index.js';
import type { MigrationState } from './state.js';

/**
 * Node: Test the current prompt with target model
 */
export async function testNode(state: typeof MigrationState.State) {
  console.log(`\n🔄 Iteration ${state.iteration + 1}/${state.maxIterations}`);
  console.log(`   Testing current prompt...`);
  
  // Create agent with current prompt
  const config = {
    ...state.targetConfig,
    systemPrompt: state.currentPrompt,
  };
  
  const agent = new SingleAgent(config);
  
  // Execute all test cases
  const outputs = new Map<string, string>();
  for (const testCase of state.testSuite.testCases) {
    const output = await agent.execute(testCase.input);
    outputs.set(testCase.id, output.response);
  }
  
  // Judge evaluation
  console.log(`   Evaluating with judge...`);
  const judge = new Judge({
    model: {
      provider: state.sourceConfig.model.provider as 'anthropic' | 'openai',
      name: state.sourceConfig.model.name,
    },
    threshold: state.threshold * 10, // Convert 0.95 → 9.5/10
  });
  
  const results = await judge.evaluateBatch(state.testSuite.testCases, outputs);
  const passed = results.filter(r => r.passed).length;
  const successRate = passed / results.length;
  
  console.log(`   Result: ${passed}/${results.length} passed (${(successRate * 100).toFixed(1)}%)`);
  
  return {
    testResults: results,
    successRate,
    iteration: state.iteration + 1,
  };
}

/**
 * Node: Check if we should continue iterating
 */
export function checkConvergence(state: typeof MigrationState.State) {
  const converged = state.successRate >= state.threshold;
  const maxed = state.iteration >= state.maxIterations;
  
  if (converged) {
    console.log(`\n✅ Converged! Success rate ${(state.successRate * 100).toFixed(1)}% >= ${(state.threshold * 100).toFixed(1)}%`);
    return {
      converged: true,
      finalPrompt: state.currentPrompt,
    };
  }
  
  if (maxed) {
    console.log(`\n⚠️  Max iterations reached. Best: ${(state.successRate * 100).toFixed(1)}%`);
    return {
      converged: false,
      finalPrompt: state.currentPrompt,
    };
  }
  
  // Continue iterating
  return { converged: false };
}

/**
 * Node: Modify the prompt based on failures
 */
export async function modifyNode(state: typeof MigrationState.State) {
  console.log(`   Generating improved prompt...`);
  
  const modifier = new Modifier({
    model: {
      provider: state.sourceConfig.model.provider as 'anthropic' | 'openai',
      name: state.sourceConfig.model.name,
    },
  });
  
  const failed = state.testResults.filter(r => !r.passed);
  
  const improvedPrompt = await modifier.modify(
    state.currentPrompt,
    failed,
    state.targetConfig.model.name
  );
  
  console.log(`   ✓ Prompt updated`);
  
  return {
    currentPrompt: improvedPrompt,
  };
}
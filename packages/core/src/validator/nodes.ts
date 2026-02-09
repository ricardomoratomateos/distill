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

  // Execute all test cases in parallel (batches of 5 for rate limiting)
  const outputs = new Map<string, string>();
  const concurrency = 5;

  for (let i = 0; i < state.testSuite.testCases.length; i += concurrency) {
    const batch = state.testSuite.testCases.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (testCase) => {
        const output = await agent.execute(testCase.input);
        return { id: testCase.id, response: output.response };
      })
    );

    // Store results
    for (const result of batchResults) {
      outputs.set(result.id, result.response);
    }
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
 * Node: Initialize the convergence strategy
 */
export function initializeStrategy(state: typeof MigrationState.State) {
  state.strategy.initialize(state);
  return {};
}

/**
 * Node: Check if we should continue iterating using the strategy
 */
export function checkConvergence(state: typeof MigrationState.State) {
  const decision = state.strategy.shouldContinue(state);

  console.log(`   Strategy decision: ${decision.reason}`);

  if (!decision.shouldContinue) {
    console.log(`\n🏁 Migration complete!`);

    // Get best result from strategy
    const best = state.strategy.getBestResult(state);

    return {
      converged: best.successRate >= state.threshold,
      finalPrompt: best.prompt,
      successRate: best.successRate,
      iteration: best.iteration,
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
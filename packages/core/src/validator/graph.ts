import { StateGraph, END } from '@langchain/langgraph';
import { MigrationState } from './state.js';
import { initializeStrategy, testNode, checkConvergence, modifyNode } from './nodes.js';

export function createMigrationGraph() {
  const graph = new StateGraph(MigrationState)
    // Add nodes
    .addNode('initialize', initializeStrategy)
    .addNode('test', testNode)
    .addNode('check', checkConvergence)
    .addNode('modify', modifyNode)

    // Define flow
    .addEdge('__start__', 'initialize')
    .addEdge('initialize', 'test')
    .addEdge('test', 'check')
    .addConditionalEdges(
      'check',
      (state) => state.converged ? 'end' : 'continue',
      {
        end: END,
        continue: 'modify',
      }
    )
    .addEdge('modify', 'test'); // Loop back

  return graph.compile();
}
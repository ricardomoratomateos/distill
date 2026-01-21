import type { AgentConfig, AgentInput, AgentOutput, AgentTrace, TestCase, TestSuite } from '../types/index.js';
import { SingleAgent } from '../agents/single-agent.js';
import { nanoid } from 'nanoid';

export interface ProfilerOptions {
  agentConfig: AgentConfig;
  numExecutions?: number; // Default: 10
}

export class Profiler {
  private config: AgentConfig;
  private agent: SingleAgent;
  private numExecutions: number;
  private testCases: TestCase[] = [];

  constructor(options: ProfilerOptions) {
    this.config = options.agentConfig;
    this.numExecutions = options.numExecutions ?? 10;
    
    // Create the agent instance
    this.agent = new SingleAgent(this.config);
  }

  /**
   * Profile the agent with given inputs
   */
  async profile(inputs: AgentInput[]): Promise<TestSuite> {
    console.log(`🔬 Profiling agent: ${this.config.name}`);
    console.log(`   Model: ${this.config.model.name}`);
    console.log(`   Executing ${inputs.length} test cases...`);

    // Execute agent for each input
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      
      console.log(`   [${i + 1}/${inputs.length}] Executing...`);
      
      // Execute the agent (now real!)
      const output = await this.agent.execute(input);
      const trace = this.agent.getLastTrace();

      if (!trace) {
        throw new Error('No trace captured from agent execution');
      }

      // Store as test case
      const testCase: TestCase = {
        id: nanoid(),
        description: `Test case ${i + 1}: ${input.message.substring(0, 50)}...`,
        input,
        expectedOutput: output,
        expectedBehavior: undefined, // Can be added manually later
      };

      this.testCases.push(testCase);
      
      console.log(`      ✓ Cost: $${trace.cost.toFixed(4)}, Latency: ${trace.latencyMs}ms`);
    }

    // Generate test suite
    const testSuite: TestSuite = {
      id: nanoid(),
      name: `${this.config.name} - Gold Standard`,
      description: `Generated from ${this.config.model.name}`,
      agentName: this.config.name,
      testCases: this.testCases,
      createdAt: new Date(),
    };

    console.log(`✅ Profiling complete: ${this.testCases.length} test cases captured`);

    return testSuite;
  }

  /**
   * Get all captured test cases
   */
  getTestCases(): TestCase[] {
    return this.testCases;
  }

  /**
   * Clear captured data
   */
  clear(): void {
    this.testCases = [];
  }

  /**
   * Export test suite to file
   */
  async exportToFile(testSuite: TestSuite, filepath: string): Promise<void> {
    const { saveTestSuite } = await import('../utils/persistence.js');
    await saveTestSuite(testSuite, filepath);
  }
}
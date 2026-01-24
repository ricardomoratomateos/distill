import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'fs/promises';
import { nanoid } from 'nanoid';
import type { TestSuite, TestCase } from '@distill/core';
import { saveTestSuite } from '../utils/config.js';

interface ManualTestCase {
  input: { message: string };
  expectedOutput: { response: string };
  description?: string;
}

export const createTestSuiteCommand = new Command('create-test-suite')
  .description('Create test suite from manual test cases (inputs + expected outputs)')
  .requiredOption('-i, --inputs <file>', 'Test cases file (JSON) with inputs and expectedOutputs')
  .option('-n, --name <name>', 'Test suite name', 'Manual Test Suite')
  .option('-d, --description <desc>', 'Test suite description')
  .option('-o, --output <file>', 'Output file for test suite', 'test-suite.json')
  .action(async (options) => {
    const spinner = ora('Loading test cases...').start();

    try {
      // Load test cases
      const content = await readFile(options.inputs, 'utf-8');
      const raw = JSON.parse(content);

      let testCases: ManualTestCase[];

      // Support different formats
      if (Array.isArray(raw)) {
        testCases = raw;
      } else if (raw.testCases) {
        testCases = raw.testCases;
      } else {
        throw new Error('Invalid format. Expected array of test cases or object with testCases field.');
      }

      // Validate format
      for (const tc of testCases) {
        if (!tc.input || !tc.input.message) {
          throw new Error('Each test case must have input.message');
        }
        if (!tc.expectedOutput || !tc.expectedOutput.response) {
          throw new Error('Each test case must have expectedOutput.response');
        }
      }

      spinner.succeed(`Loaded ${testCases.length} test cases`);

      // Create TestSuite
      const testSuite: TestSuite = {
        id: nanoid(),
        name: options.name,
        description: options.description || 'Manually created test suite',
        agentName: 'Manual',
        createdAt: new Date(),
        testCases: testCases.map(tc => ({
          id: nanoid(),
          description: tc.description || `Test: ${tc.input.message.substring(0, 50)}`,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
        })),
      };

      // Save
      await saveTestSuite(options.output, testSuite);

      spinner.succeed(chalk.green(`Created test suite with ${testSuite.testCases.length} test cases`));

      // Print summary
      console.log('\n' + chalk.bold('Test Suite Created:'));
      console.log(`  ID: ${chalk.dim(testSuite.id)}`);
      console.log(`  Name: ${testSuite.name}`);
      console.log(`  Description: ${testSuite.description}`);
      console.log(`  Test cases: ${testSuite.testCases.length}`);
      console.log(`  Saved to: ${chalk.cyan(options.output)}`);

      // Show sample
      if (testSuite.testCases.length > 0) {
        console.log('\n' + chalk.bold('Sample test case:'));
        const sample = testSuite.testCases[0];
        console.log(`  Input: ${chalk.dim(sample.input.message)}`);
        const output = sample.expectedOutput?.response || 'No output';
        console.log(`  Expected Output: ${chalk.dim(output.substring(0, 100))}${output.length > 100 ? '...' : ''}`);
      }

      console.log('\n' + chalk.green('✓ Ready to use with distill migrate'));

    } catch (error) {
      spinner.fail(chalk.red('Failed to create test suite'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Profiler } from '@distill/core';
import { loadAgentConfig, loadTestInputs, saveTestSuite } from '../utils/config.js';

export const profileCommand = new Command('profile')
  .description('Profile an agent to create gold standard test suite')
  .requiredOption('-c, --config <file>', 'Agent config file (YAML)')
  .option('-i, --inputs <file>', 'Test inputs file (JSON)')
  .option('-o, --output <file>', 'Output file for test suite', 'test-suite.json')
  .option('-n, --num <number>', 'Number of test cases (if no inputs file)', '10')
  .action(async (options) => {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load agent config
      const agentConfig = await loadAgentConfig(options.config);
      spinner.text = `Agent: ${agentConfig.name} (${agentConfig.model.name})`;

      // Load or generate test inputs
      let testInputs;
      if (options.inputs) {
        testInputs = await loadTestInputs(options.inputs);
        spinner.succeed(`Loaded ${testInputs.length} test inputs`);
      } else {
        // Use default prompts for demo
        const num = parseInt(options.num, 10);
        testInputs = [
          { message: 'Hello, how can you help me?' },
          { message: 'What are your capabilities?' },
          { message: 'Explain your main purpose.' },
        ].slice(0, num);
        spinner.warn(`No inputs file provided. Using ${testInputs.length} default prompts.`);
        console.log(chalk.dim('  Use -i/--inputs to provide custom test cases.\n'));
      }

      // Profile
      spinner.start(`Profiling with ${agentConfig.model.name}...`);

      const profiler = new Profiler({
        agentConfig,
        numExecutions: 1,
      });

      const testSuite = await profiler.profile(testInputs);

      // Save test suite
      await saveTestSuite(options.output, testSuite);

      spinner.succeed(chalk.green(`Profiled ${testSuite.testCases.length} test cases`));

      // Print summary
      console.log('\n' + chalk.bold('Test Suite Created:'));
      console.log(`  ID: ${chalk.dim(testSuite.id)}`);
      console.log(`  Name: ${testSuite.name}`);
      console.log(`  Test cases: ${testSuite.testCases.length}`);
      console.log(`  Saved to: ${chalk.cyan(options.output)}`);

      // Show sample
      if (testSuite.testCases.length > 0) {
        console.log('\n' + chalk.bold('Sample test case:'));
        const sample = testSuite.testCases[0];
        console.log(`  Input: ${chalk.dim(sample.input.message)}`);
        const output = sample.expectedOutput?.response || 'No output';
        console.log(`  Output: ${chalk.dim(output.substring(0, 100))}...`);
      }

    } catch (error) {
      spinner.fail(chalk.red('Profiling failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

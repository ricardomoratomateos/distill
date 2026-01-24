import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SingleAgent, Judge } from '@distill/core';
import { loadAgentConfig, loadTestSuite } from '../utils/config.js';

export const evaluateCommand = new Command('evaluate')
  .description('Evaluate an agent against a test suite')
  .requiredOption('-c, --config <file>', 'Agent config file to evaluate (YAML)')
  .requiredOption('-p, --profile <file>', 'Test suite file (JSON)')
  .option('--judge-model <model>', 'Model for judging', 'claude-sonnet-4-20250514')
  .option('--judge-provider <provider>', 'Judge provider', 'anthropic')
  .option('--threshold <number>', 'Pass threshold score (0-10)', '8')
  .action(async (options) => {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load agent config
      const agentConfig = await loadAgentConfig(options.config);
      spinner.text = `Agent: ${agentConfig.name} (${agentConfig.model.name})`;

      // Load test suite
      const testSuite = await loadTestSuite(options.profile);
      spinner.succeed(`Loaded ${testSuite.testCases.length} test cases`);

      // Create agent
      spinner.start('Running agent on test cases...');
      const agent = new SingleAgent(agentConfig);

      const actualOutputs = new Map<string, string>();
      let completed = 0;

      for (const testCase of testSuite.testCases) {
        const output = await agent.execute(testCase.input);
        actualOutputs.set(testCase.id, output.response);
        completed++;
        spinner.text = `Running agent... ${completed}/${testSuite.testCases.length}`;
      }

      spinner.succeed(`Generated ${actualOutputs.size} outputs`);

      // Judge evaluation
      spinner.start('Evaluating with judge...');

      const judge = new Judge({
        model: {
          provider: options.judgeProvider as 'anthropic' | 'openai',
          name: options.judgeModel,
        },
        threshold: parseFloat(options.threshold),
      });

      const results = await judge.evaluateBatch(testSuite.testCases, actualOutputs);

      spinner.succeed('Evaluation complete');

      // Calculate summary
      const passed = results.filter(r => r.passed).length;
      const total = results.length;
      const passRate = (passed / total) * 100;

      // Print results
      console.log('\n' + chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold('Evaluation Results\n'));

      console.log(`Agent: ${chalk.cyan(agentConfig.name)}`);
      console.log(`Model: ${chalk.cyan(agentConfig.model.name)}`);
      console.log(`Test cases: ${total}`);
      console.log(`Passed: ${chalk.green(passed)}`);
      console.log(`Failed: ${chalk.red(total - passed)}`);
      console.log(`Pass rate: ${passRate >= 75 ? chalk.green(passRate.toFixed(1) + '%') : chalk.yellow(passRate.toFixed(1) + '%')}`);

      // Show failed cases
      const failed = results.filter(r => !r.passed);
      if (failed.length > 0) {
        console.log('\n' + chalk.bold('Failed Test Cases:\n'));

        failed.slice(0, 5).forEach((result, i) => {
          const testCase = testSuite.testCases.find(tc => tc.id === result.testCaseId)!;
          const evaluation = result.evaluation!;

          console.log(chalk.red(`${i + 1}. ${testCase.description || testCase.input.message.substring(0, 50)}`));
          console.log(`   Score: ${evaluation.scores.correctness}/10`);
          console.log(`   Issues: ${chalk.dim(evaluation.failures.join(', '))}`);
          if (evaluation.suggestions.length > 0) {
            console.log(`   Suggestions: ${chalk.dim(evaluation.suggestions[0])}`);
          }
          console.log('');
        });

        if (failed.length > 5) {
          console.log(chalk.dim(`   ... and ${failed.length - 5} more failures`));
        }
      }

      console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

      // Exit code
      if (passRate >= 75) {
        console.log(chalk.green('\n✅ Evaluation PASSED'));
        process.exit(0);
      } else {
        console.log(chalk.yellow('\n⚠️  Evaluation needs improvement'));
        process.exit(1);
      }

    } catch (error) {
      spinner.fail(chalk.red('Evaluation failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

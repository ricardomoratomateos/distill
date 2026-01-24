import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  Validator,
  ThresholdPlusBonusRoundsStrategy,
  AlwaysRunMaxStrategy,
  EarlyStoppingWithPatienceStrategy,
  type AgentConfig,
} from '@distill/core';
import { loadAgentConfig, loadTestSuite, saveAgentConfig } from '../utils/config.js';

export const migrateCommand = new Command('migrate')
  .description('Migrate agent from expensive to cheap model')
  .requiredOption('-c, --config <file>', 'Source agent config file (YAML)')
  .requiredOption('-p, --profile <file>', 'Test suite from profiling (JSON)')
  .option('-t, --target-model <model>', 'Target model name', 'gpt-4o-mini')
  .option('--target-provider <provider>', 'Target provider (anthropic|openai)', 'openai')
  .option('--threshold <number>', 'Success threshold (0-1)', '0.75')
  .option('--max-iterations <number>', 'Max optimization iterations', '10')
  .option('--strategy <strategy>', 'Convergence strategy (threshold-bonus|always-max|early-stop)', 'threshold-bonus')
  .option('--bonus-rounds <number>', 'Bonus rounds for threshold-bonus strategy', '2')
  .option('--patience <number>', 'Patience for early-stop strategy', '3')
  .option('-o, --output <file>', 'Output file for optimized config')
  .action(async (options) => {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load source agent config
      const sourceConfig = await loadAgentConfig(options.config);
      spinner.text = `Source: ${sourceConfig.name} (${sourceConfig.model.name})`;

      // Load test suite
      const testSuite = await loadTestSuite(options.profile);
      spinner.succeed(`Loaded test suite: ${testSuite.testCases.length} test cases`);

      // Create target config
      const targetConfig: AgentConfig = {
        ...sourceConfig,
        name: `${sourceConfig.name} (Optimized)`,
        model: {
          provider: options.targetProvider as 'anthropic' | 'openai',
          name: options.targetModel,
          temperature: sourceConfig.model.temperature,
        },
        systemPrompt: sourceConfig.systemPrompt, // Will be optimized
      };

      console.log('\n' + chalk.bold('Migration Configuration:'));
      console.log(`  Source:     ${chalk.cyan(sourceConfig.model.name)}`);
      console.log(`  Target:     ${chalk.cyan(targetConfig.model.name)}`);
      console.log(`  Threshold:  ${chalk.cyan((parseFloat(options.threshold) * 100).toFixed(0) + '%')}`);
      console.log(`  Max iters:  ${chalk.cyan(options.maxIterations)}`);
      console.log(`  Strategy:   ${chalk.cyan(options.strategy)}`);

      // Create convergence strategy
      let strategy;
      switch (options.strategy) {
        case 'always-max':
          strategy = new AlwaysRunMaxStrategy();
          break;
        case 'early-stop':
          strategy = new EarlyStoppingWithPatienceStrategy({
            patience: parseInt(options.patience, 10),
          });
          break;
        case 'threshold-bonus':
        default:
          strategy = new ThresholdPlusBonusRoundsStrategy({
            bonusRounds: parseInt(options.bonusRounds, 10),
          });
          break;
      }

      // Create validator
      const validator = new Validator({
        threshold: parseFloat(options.threshold),
        maxIterations: parseInt(options.maxIterations, 10),
        strategy,
      });

      spinner.start('Starting migration...\n');

      // Run migration
      const result = await validator.migrate(sourceConfig, targetConfig, testSuite);

      spinner.stop();

      // Print results
      console.log('\n' + chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.bold('Migration Results\n'));

      if (result.success) {
        console.log(chalk.green('✅ SUCCESS'));
      } else {
        console.log(chalk.yellow('⚠️  PARTIAL SUCCESS'));
      }

      console.log(`Iterations: ${result.iterations}`);
      console.log(`Success Rate: ${chalk.cyan((result.finalSuccessRate * 100).toFixed(1) + '%')}`);
      console.log(`Target: ${chalk.dim((parseFloat(options.threshold) * 100).toFixed(1) + '%')}`);

      console.log('\n' + chalk.bold('Prompt Evolution:'));
      console.log(chalk.dim('Original:'));
      console.log(chalk.dim(`  "${result.originalPrompt.substring(0, 80)}..."`));
      console.log(chalk.dim('Optimized:'));
      console.log(chalk.dim(`  "${result.finalPrompt.substring(0, 80)}..."`));

      // Save optimized config
      const outputFile = options.output || options.config.replace('.yaml', '.optimized.yaml');
      const optimizedConfig: AgentConfig = {
        ...targetConfig,
        systemPrompt: result.finalPrompt,
      };

      await saveAgentConfig(outputFile, optimizedConfig);

      console.log('\n' + chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(`\nOptimized config saved to: ${chalk.cyan(outputFile)}`);

      if (!result.success) {
        console.log('\n' + chalk.yellow('Consider:'));
        console.log(chalk.dim('  - Increasing --max-iterations'));
        console.log(chalk.dim('  - Lowering --threshold'));
        console.log(chalk.dim('  - Using a more capable target model'));
      }

    } catch (error) {
      spinner.fail(chalk.red('Migration failed'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

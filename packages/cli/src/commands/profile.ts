import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "fs/promises";
import {
  Profiler,
  loadAgentSpec,
  loadTestCases,
  type AgentSpec,
} from "@distill/core";

export const profileCommand = new Command("profile")
  .description("Profile an agent to capture gold standard outputs")
  .requiredOption("-c, --config <file>", "Agent config file (YAML)")
  .option("-t, --test-cases <file>", "Test cases file (JSON)")
  .option("-n, --runs <number>", "Number of runs per test case", "1")
  .option("-o, --output <file>", "Output file for profile data", "profile.json")
  .action(async (options) => {
    const spinner = ora("Loading agent configuration...").start();

    try {
      // Load agent spec from YAML
      const spec = await loadAgentSpec(options.config);
      spinner.text = `Loaded agent: ${spec.name}`;

      // Load test cases if provided, otherwise use default prompts
      let testInputs: { prompt: string; category?: string }[] = [];

      if (options.testCases) {
        const cases = await loadTestCases(options.testCases);
        testInputs = cases.map(c => ({
          prompt: c.input,
          category: c.category,
        }));
        spinner.text = `Loaded ${testInputs.length} test cases`;
      } else {
        // Default test prompts for demo
        testInputs = [
          { prompt: "Hello, how can you help me?", category: "greeting" },
          { prompt: "What are your capabilities?", category: "info" },
        ];
        console.log(chalk.yellow("\nNo test cases provided. Using default prompts."));
        console.log(chalk.dim("Use -t/--test-cases to provide custom test cases.\n"));
      }

      const runs = parseInt(options.runs, 10);
      const totalRuns = testInputs.length * runs;

      spinner.text = `Profiling ${totalRuns} runs with ${spec.model.name}...`;

      const profiler = new Profiler({ spec });

      // Profile all inputs
      let completed = 0;
      for (let run = 0; run < runs; run++) {
        for (const input of testInputs) {
          await profiler.profile(input);
          completed++;
          spinner.text = `Profiling... ${completed}/${totalRuns}`;
        }
      }

      // Export profile data
      const profileData = profiler.export();
      await writeFile(options.output, JSON.stringify(profileData, null, 2));

      const metrics = profiler.getMetrics();

      spinner.succeed(chalk.green(`Profiled ${profiler.count} entries`));

      // Print summary
      console.log("\n" + chalk.bold("Baseline Metrics:"));
      console.log(`  Model:       ${spec.model.name}`);
      console.log(`  Provider:    ${spec.model.provider}`);
      console.log(`  Total runs:  ${metrics.totalRuns}`);
      console.log(`  Avg cost:    $${metrics.avgCost.toFixed(4)}/run`);
      console.log(`  Avg latency: ${(metrics.avgLatency / 1000).toFixed(2)}s`);
      console.log(`\n  ${chalk.dim(`Saved to: ${options.output}`)}`);

    } catch (error) {
      spinner.fail(chalk.red("Profiling failed"));
      console.error(chalk.red(error instanceof Error ? error.message : error));
      process.exit(1);
    }
  });

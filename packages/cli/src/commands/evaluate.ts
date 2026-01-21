import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "fs/promises";
import {
  ProfileDataSchema,
  loadAgentSpec,
  createAgentFromSpec,
  Validator,
  type ModelConfig,
  type ProfileData,
} from "@distill/core";

export const evaluateCommand = new Command("evaluate")
  .description("Evaluate a migrated agent against the gold standard")
  .requiredOption("-c, --config <file>", "Agent config file (YAML) to evaluate")
  .requiredOption("-p, --profile <file>", "Profile data file (gold standard)")
  .option("-o, --output <file>", "Output file for evaluation report")
  .option("--threshold <number>", "Pass threshold (0-1)", "0.95")
  .option("--sample <number>", "Sample size for quick evaluation", "0")
  .option("--judge-model <model>", "Model for judging", "claude-sonnet-4-20250514")
  .option("--judge-provider <provider>", "Judge provider", "anthropic")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Load agent spec
      const spec = await loadAgentSpec(options.config);
      spinner.text = `Agent: ${spec.name} (${spec.model.name})`;

      // Load profile data
      const profileRaw = await readFile(options.profile, "utf-8");
      const profileData: ProfileData = ProfileDataSchema.parse(
        JSON.parse(profileRaw)
      );

      const sampleSize = parseInt(options.sample, 10) || profileData.entries.length;
      const entries = sampleSize < profileData.entries.length
        ? profileData.entries.slice(0, sampleSize)
        : profileData.entries;

      spinner.text = `Evaluating ${entries.length} entries...`;

      const judgeModel: ModelConfig = {
        provider: options.judgeProvider as "anthropic" | "openai",
        name: options.judgeModel,
        temperature: 0,
      };

      const threshold = parseFloat(options.threshold);

      // Create agent and generate outputs
      const agent = createAgentFromSpec(spec, "migrator");

      const outputs = new Map<string, string>();
      let completed = 0;

      for (const entry of entries) {
        agent.resetTracking();
        const output = await agent.invoke(entry.input);
        outputs.set(entry.id, output);
        completed++;
        spinner.text = `Generating outputs... ${completed}/${entries.length}`;
      }

      spinner.text = "Running evaluation...";

      // Validate
      const validator = new Validator({
        judge: { model: judgeModel, threshold },
        threshold,
      });

      const summary = await validator.validate({
        entries,
        targetOutputs: outputs,
      });

      spinner.stop();

      // Print report
      const report = validator.generateReport(summary);
      console.log("\n" + report);

      // Status
      if (validator.passes(summary)) {
        console.log(chalk.green("✓ Evaluation PASSED"));
      } else {
        console.log(chalk.red("✗ Evaluation FAILED"));
      }

      // Cost summary
      const cost = agent.getCost();
      console.log(chalk.dim(`\nTotal cost: $${cost.totalCost.toFixed(4)}`));
      console.log(chalk.dim(`Tokens: ${cost.inputTokens} in / ${cost.outputTokens} out`));

      // Save report if output specified
      if (options.output) {
        const fullReport = {
          agent: spec.name,
          model: spec.model,
          judgeModel,
          threshold,
          summary,
          timestamp: new Date().toISOString(),
        };
        await writeFile(options.output, JSON.stringify(fullReport, null, 2));
        console.log(chalk.dim(`\nReport saved to: ${options.output}`));
      }

      process.exit(validator.passes(summary) ? 0 : 1);

    } catch (error) {
      spinner.fail(chalk.red("Evaluation failed"));
      console.error(chalk.red(error instanceof Error ? error.message : error));
      process.exit(1);
    }
  });

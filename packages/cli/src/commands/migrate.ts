import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile, writeFile } from "fs/promises";
import {
  ProfileDataSchema,
  loadAgentSpec,
  saveAgentSpec,
  createAgentFromSpec,
  Modifier,
  Validator,
  type ModelConfig,
  type ProfileData,
  type AgentSpec,
} from "@distill/core";

export const migrateCommand = new Command("migrate")
  .description("Migrate agent from expensive to cheap model")
  .requiredOption("-c, --config <file>", "Agent config file (YAML)")
  .option("-p, --profile <file>", "Profile data file (from 'distill profile')")
  .option("-t, --target <model>", "Target model name", "gpt-4o-mini")
  .option("--target-provider <provider>", "Target provider (anthropic|openai)", "openai")
  .option("--threshold <number>", "Success threshold (0-1)", "0.95")
  .option("--max-iterations <number>", "Max optimization iterations", "10")
  .option("-o, --output <file>", "Output file for optimized config")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Load agent spec
      const sourceSpec = await loadAgentSpec(options.config);
      spinner.text = `Source agent: ${sourceSpec.name} (${sourceSpec.model.name})`;

      // Load or create profile data
      let profileData: ProfileData;

      if (options.profile) {
        const profileRaw = await readFile(options.profile, "utf-8");
        profileData = ProfileDataSchema.parse(JSON.parse(profileRaw));
        spinner.text = `Loaded ${profileData.entries.length} profile entries`;
      } else {
        spinner.fail(chalk.red("Profile data required. Run 'distill profile' first."));
        process.exit(1);
      }

      const targetModel: ModelConfig = {
        provider: options.targetProvider as "anthropic" | "openai",
        name: options.target,
        temperature: 0,
      };

      const judgeModel: ModelConfig = {
        provider: sourceSpec.model.provider,
        name: sourceSpec.model.name,
        temperature: 0,
      };

      const threshold = parseFloat(options.threshold);
      const maxIterations = parseInt(options.maxIterations, 10);

      console.log("\n" + chalk.bold("Migration Configuration:"));
      console.log(`  Source:     ${sourceSpec.model.name}`);
      console.log(`  Target:     ${targetModel.name}`);
      console.log(`  Threshold:  ${(threshold * 100).toFixed(0)}%`);
      console.log(`  Max iters:  ${maxIterations}`);
      console.log("");

      // Create target spec
      const targetSpec: AgentSpec = {
        ...sourceSpec,
        model: targetModel,
      };

      let currentPrompt = sourceSpec.systemPrompt;
      const targetAgent = createAgentFromSpec({ ...targetSpec, systemPrompt: currentPrompt }, "migrator");

      const modifier = new Modifier({
        model: judgeModel,
        maxIterations,
      });

      const validator = new Validator({
        judge: { model: judgeModel, threshold },
        threshold,
      });

      // Migration loop
      let iteration = 0;
      let bestSummary = null;

      spinner.start("Starting migration...\n");

      while (iteration < maxIterations) {
        iteration++;
        console.log(chalk.dim(`\nIteration ${iteration}/${maxIterations}`));

        // Generate outputs with current prompt
        spinner.text = `Running target model...`;
        const outputs = new Map<string, string>();

        for (const entry of profileData.entries) {
          targetAgent.resetTracking();
          const output = await targetAgent.invoke(entry.input);
          outputs.set(entry.id, output);
        }

        // Validate
        spinner.text = `Evaluating quality...`;
        const summary = await validator.validate({
          entries: profileData.entries,
          targetOutputs: outputs,
        });

        bestSummary = summary;
        const successRate = summary.passedEntries / summary.totalEntries;

        console.log(
          `  ${chalk.cyan("Result:")} ${(successRate * 100).toFixed(0)}% success (${summary.passedEntries}/${summary.totalEntries})`
        );

        if (validator.passes(summary)) {
          spinner.succeed(chalk.green(`\nMigration successful after ${iteration} iteration(s)!`));
          break;
        }

        if (iteration < maxIterations) {
          spinner.text = `Refining prompt...`;

          const failed = summary.results.filter((r) => !r.passed);
          const modification = await modifier.modify(
            currentPrompt,
            profileData.entries,
            failed
          );

          currentPrompt = modification.modifiedPrompt;
          targetAgent.setSystemPrompt(currentPrompt);

          console.log(chalk.dim(`  Changes: ${modification.changes.slice(0, 2).join(", ")}${modification.changes.length > 2 ? "..." : ""}`));
        }
      }

      spinner.stop();

      // Calculate savings
      const sourceMetrics = profileData.metrics;
      const targetCost = targetAgent.getCost();
      const avgTargetCost = targetCost.totalCost / profileData.entries.length;

      console.log("\n" + chalk.bold("Migration Results:"));
      console.log("┌────────────────────────────────────────────┐");
      console.log(`│  ${chalk.dim("Metric")}          ${chalk.dim("Before")}        ${chalk.dim("After")}       │`);
      console.log("├────────────────────────────────────────────┤");
      console.log(`│  Model           ${sourceSpec.model.name.slice(0, 12).padEnd(12)}  ${targetModel.name.padEnd(12)} │`);

      if (sourceMetrics && bestSummary) {
        const successBefore = (sourceMetrics.successRate * 100).toFixed(0);
        const successAfter = ((bestSummary.passedEntries / bestSummary.totalEntries) * 100).toFixed(0);
        console.log(`│  Success rate    ${successBefore.padStart(3)}%          ${successAfter.padStart(3)}%         │`);

        const costBefore = `$${sourceMetrics.avgCost.toFixed(4)}`;
        const costAfter = `$${avgTargetCost.toFixed(4)}`;
        console.log(`│  Cost/run        ${costBefore.padEnd(12)}  ${costAfter.padEnd(12)} │`);

        const savings = ((1 - avgTargetCost / sourceMetrics.avgCost) * 100).toFixed(0);
        console.log("├────────────────────────────────────────────┤");
        console.log(`│  ${chalk.green("Savings:")}         ${chalk.green(savings + "%")}                       │`);
      }

      console.log("└────────────────────────────────────────────┘");

      // Save optimized config
      const outputFile = options.output || options.config.replace(".yaml", ".optimized.yaml");
      const optimizedSpec: AgentSpec = {
        ...targetSpec,
        systemPrompt: currentPrompt,
      };

      await saveAgentSpec(outputFile, optimizedSpec);
      console.log(chalk.dim(`\nOptimized config saved to: ${outputFile}`));

    } catch (error) {
      spinner.fail(chalk.red("Migration failed"));
      console.error(chalk.red(error instanceof Error ? error.message : error));
      process.exit(1);
    }
  });

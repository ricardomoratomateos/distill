/**
 * Basic example: Migrate a simple Q&A agent from Claude Sonnet to GPT-4o-mini
 *
 * This example demonstrates the core workflow:
 * 1. Profile the expensive model (Claude Sonnet)
 * 2. Migrate to a cheaper model (GPT-4o-mini)
 * 3. Validate the migration quality
 */
import "dotenv/config";
import {
  Profiler,
  Judge,
  Modifier,
  Validator,
  createProfilerAgent,
  createMigratorAgent,
  type ModelConfig,
} from "@distill/core";

// Example prompts to profile
const SAMPLE_PROMPTS = [
  "What is the capital of France?",
  "Explain photosynthesis in simple terms.",
  "Write a haiku about programming.",
  "What are the benefits of TypeScript over JavaScript?",
  "How does a binary search algorithm work?",
];

async function main() {
  console.log("🔬 Distill Basic Example\n");

  // Step 1: Define models
  const sourceModel: ModelConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    temperature: 0,
  };

  const targetModel: ModelConfig = {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0,
  };

  const judgeModel: ModelConfig = {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    temperature: 0,
  };

  // Step 2: Profile the expensive model
  console.log("📊 Profiling source model...");
  const profiler = new Profiler({ model: sourceModel });

  for (const prompt of SAMPLE_PROMPTS) {
    await profiler.profile({ prompt });
    process.stdout.write(".");
  }
  console.log(` Done! (${profiler.count} entries)\n`);

  const profileData = profiler.export();

  // Step 3: Test target model with a basic system prompt
  console.log("🎯 Testing target model...");
  const systemPrompt = "You are a helpful assistant. Be concise and accurate.";
  const targetAgent = createMigratorAgent(targetModel, systemPrompt);

  const targetOutputs = new Map<string, string>();
  for (const entry of profileData.entries) {
    const output = await targetAgent.invoke(entry.input);
    targetOutputs.set(entry.id, output);
    process.stdout.write(".");
  }
  console.log(" Done!\n");

  // Step 4: Validate migration quality
  console.log("⚖️  Validating migration...");
  const validator = new Validator({
    judge: { model: judgeModel, threshold: 0.7 },
    threshold: 0.7,
  });

  const summary = await validator.validate({
    entries: profileData.entries,
    targetOutputs,
  });

  // Step 5: Print results
  console.log("\n" + validator.generateReport(summary));

  if (validator.passes(summary)) {
    console.log("✅ Migration successful!");
  } else {
    console.log("⚠️  Migration needs refinement.");
    console.log("   Consider using the Modifier to improve the system prompt.");
  }

  // Example of using the Modifier (commented out to avoid extra API calls)
  /*
  if (!validator.passes(summary)) {
    console.log("\n🔧 Refining system prompt...");
    const modifier = new Modifier({ model: judgeModel });
    const failed = summary.results.filter(r => !r.passed);
    const modification = await modifier.modify(
      systemPrompt,
      profileData.entries,
      failed
    );
    console.log(`   New prompt: ${modification.modifiedPrompt}`);
  }
  */
}

main().catch(console.error);

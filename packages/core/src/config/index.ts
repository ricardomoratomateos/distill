import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { AgentSpecSchema, type AgentSpec } from "../types/index.js";

/**
 * Load and validate an agent spec from a YAML file
 */
export async function loadAgentSpec(filePath: string): Promise<AgentSpec> {
  const content = await readFile(filePath, "utf-8");
  const raw = parseYaml(content);
  return AgentSpecSchema.parse(raw);
}

/**
 * Load test cases from a JSON file
 */
export async function loadTestCases(filePath: string): Promise<{ input: string; context?: Record<string, unknown>; category?: string }[]> {
  const content = await readFile(filePath, "utf-8");
  const raw = JSON.parse(content);

  if (Array.isArray(raw)) {
    // Simple array of strings or objects
    return raw.map((item, index) => {
      if (typeof item === "string") {
        return { input: item };
      }
      return {
        input: item.input || item.prompt || item.message,
        context: item.context,
        category: item.category,
      };
    });
  }

  // Object with cases array
  if (raw.cases) {
    return raw.cases;
  }

  throw new Error("Invalid test cases format");
}

/**
 * Save agent spec to YAML file
 */
export async function saveAgentSpec(filePath: string, spec: AgentSpec): Promise<void> {
  const { stringify } = await import("yaml");
  const content = stringify(spec);
  const { writeFile } = await import("fs/promises");
  await writeFile(filePath, content, "utf-8");
}

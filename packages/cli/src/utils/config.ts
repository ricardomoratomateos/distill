import { readFile, writeFile } from 'fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { AgentConfigSchema, type AgentConfig, type TestSuite } from '@distill/core';

/**
 * Load and validate agent config from YAML file
 */
export async function loadAgentConfig(filePath: string): Promise<AgentConfig> {
  const content = await readFile(filePath, 'utf-8');
  const raw = parseYaml(content);
  return AgentConfigSchema.parse(raw);
}

/**
 * Save agent config to YAML file
 */
export async function saveAgentConfig(filePath: string, config: AgentConfig): Promise<void> {
  const content = stringifyYaml(config);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Load test suite from JSON file
 */
export async function loadTestSuite(filePath: string): Promise<TestSuite> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save test suite to JSON file
 */
export async function saveTestSuite(filePath: string, testSuite: TestSuite): Promise<void> {
  const content = JSON.stringify(testSuite, null, 2);
  await writeFile(filePath, content, 'utf-8');
}

/**
 * Load test inputs from JSON file
 */
export async function loadTestInputs(filePath: string): Promise<Array<{ message: string }>> {
  const content = await readFile(filePath, 'utf-8');
  const raw = JSON.parse(content);

  // Support different formats
  if (Array.isArray(raw)) {
    return raw.map(item => {
      if (typeof item === 'string') {
        return { message: item };
      }
      return { message: item.message || item.input || item.prompt };
    });
  }

  // Object with inputs array
  if (raw.inputs) {
    return raw.inputs.map((msg: string) => ({ message: msg }));
  }

  throw new Error('Invalid test inputs format. Expected array of strings or objects.');
}

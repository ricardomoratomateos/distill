import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { TestSuite } from '../types/index.js';

/**
 * Save a TestSuite to a JSON file
 */
export async function saveTestSuite(
  testSuite: TestSuite,
  filepath: string
): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(filepath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Serialize with nice formatting
    const json = JSON.stringify(testSuite, null, 2);
    
    await writeFile(filepath, json, 'utf-8');
    
    console.log(`💾 TestSuite saved: ${filepath}`);
  } catch (error) {
    throw new Error(`Failed to save TestSuite: ${error}`);
  }
}

/**
 * Load a TestSuite from a JSON file
 */
export async function loadTestSuite(filepath: string): Promise<TestSuite> {
  try {
    if (!existsSync(filepath)) {
      throw new Error(`File not found: ${filepath}`);
    }

    const json = await readFile(filepath, 'utf-8');
    const data = JSON.parse(json);
    
    // Convert date strings back to Date objects
    data.createdAt = new Date(data.createdAt);
    
    console.log(`📂 TestSuite loaded: ${filepath}`);
    console.log(`   Name: ${data.name}`);
    console.log(`   Test cases: ${data.testCases.length}`);
    
    return data as TestSuite;
  } catch (error) {
    throw new Error(`Failed to load TestSuite: ${error}`);
  }
}

/**
 * Generate a filename for a TestSuite
 */
export function generateTestSuiteFilename(agentName: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sanitized = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  return `${sanitized}-${date}.json`;
}
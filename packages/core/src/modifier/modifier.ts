import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { TestResult } from '../types/index.js';
import { buildModifierPrompt } from '../prompts/modifier-prompt.js';

export interface ModifierConfig {
  model: {
    provider: 'anthropic' | 'openai';
    name: string;
  };
}

export class Modifier {
  private model: ChatAnthropic | ChatOpenAI;

  constructor(config: ModifierConfig) {
    this.model = this.createModel(config.model);
  }

  private createModel(modelConfig: ModifierConfig['model']): ChatAnthropic | ChatOpenAI {
    switch (modelConfig.provider) {
      case 'anthropic':
        return new ChatAnthropic({
          modelName: modelConfig.name,
          temperature: 0.7,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });
      
      case 'openai':
        return new ChatOpenAI({
          modelName: modelConfig.name,
          temperature: 0.7,
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
  }

  async modify(
    currentPrompt: string,
    failedTests: TestResult[],
    targetModelName: string
  ): Promise<string> {
    const modifierPrompt = buildModifierPrompt({
      currentPrompt,
      failedTests,
      modelName: targetModelName,
    });

    try {
      const response = await this.model.invoke(modifierPrompt);
      const improvedPrompt = response.content as string;
      
      return improvedPrompt.trim();
    } catch (error) {
      throw new Error(`Modifier failed: ${error}`);
    }
  }
}
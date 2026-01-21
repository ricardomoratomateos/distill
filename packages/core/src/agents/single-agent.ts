import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessage } from '@langchain/core/messages';
import type { 
  Agent, 
  AgentConfig, 
  AgentInput, 
  AgentOutput, 
  AgentTrace 
} from '../types/index.js';

export class SingleAgent implements Agent {
  readonly type = 'single' as const;
  readonly name: string;
  
  private config: AgentConfig;
  private model: ChatAnthropic | ChatOpenAI;
  private lastTrace: AgentTrace | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.name = config.name;
    
    // Initialize the appropriate model
    this.model = this.createModel(config);
  }

  private createModel(config: AgentConfig): ChatAnthropic | ChatOpenAI {
    const modelConfig = {
      modelName: config.model.name,
      temperature: config.model.temperature ?? 0,
      maxTokens: config.model.maxTokens,
    };

    switch (config.model.provider) {
      case 'anthropic':
        return new ChatAnthropic({
          ...modelConfig,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });
      
      case 'openai':
        return new ChatOpenAI({
          ...modelConfig,
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
      
      case 'google':
        throw new Error('Google provider not yet implemented');
      
      default:
        throw new Error(`Unknown provider: ${config.model.provider}`);
    }
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    
    try {
      // Build messages
      const messages: BaseMessage[] = [
        { role: 'system', content: this.config.systemPrompt } as any,
        { role: 'user', content: input.message } as any,
      ];

      // Call the model
      const response = await this.model.invoke(messages);
      
      // Calculate metrics
      const latencyMs = Date.now() - startTime;
      const tokensUsed = {
        input: response.usage_metadata?.input_tokens ?? 0,
        output: response.usage_metadata?.output_tokens ?? 0,
        total: (response.usage_metadata?.input_tokens ?? 0) + 
               (response.usage_metadata?.output_tokens ?? 0),
      };
      
      // Calculate cost (simplified - real pricing varies)
      const cost = this.calculateCost(tokensUsed);

      // Store trace
      this.lastTrace = {
        input,
        output: { response: response.content as string },
        tokensUsed,
        latencyMs,
        cost,
        timestamp: new Date(),
        modelUsed: this.config.model.name,
      };

      return {
        response: response.content as string,
        metadata: {
          tokensUsed,
          latencyMs,
          cost,
        },
      };
      
    } catch (error) {
      throw new Error(`Agent execution failed: ${error}`);
    }
  }

  private calculateCost(tokens: { input: number; output: number }): number {
    // Simplified pricing (per 1M tokens)
    // Real pricing should come from a pricing table
    const pricing = this.getPricing();
    
    return (
      (tokens.input / 1_000_000) * pricing.input +
      (tokens.output / 1_000_000) * pricing.output
    );
  }

  private getPricing(): { input: number; output: number } {
    // Pricing per 1M tokens (as of Jan 2024)
    const pricingTable: Record<string, { input: number; output: number }> = {
      'claude-sonnet-4-20250514': { input: 3, output: 15 },
      'claude-opus-4-20241113': { input: 15, output: 75 },
      'claude-haiku-4-20250514': { input: 0.8, output: 4 },
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
    };

    return pricingTable[this.config.model.name] ?? { input: 1, output: 3 };
  }

  getLastTrace(): AgentTrace | null {
    return this.lastTrace;
  }

  getLastCost(): number {
    return this.lastTrace?.cost ?? 0;
  }
}
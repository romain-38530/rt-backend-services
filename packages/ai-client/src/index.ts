import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@rt/utils';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async chat(
    messages: AIMessage[],
    model: string = 'gpt-4-turbo-preview'
  ): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages as any,
      });

      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      logger.error('OpenAI API error', { error });
      throw error;
    }
  }
}

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async chat(
    messages: AIMessage[],
    model: string = 'claude-3-sonnet-20240229'
  ): Promise<AIResponse> {
    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: chatMessages,
      });

      return {
        content:
          response.content[0]?.type === 'text'
            ? response.content[0].text
            : '',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      logger.error('Anthropic API error', { error });
      throw error;
    }
  }
}

export function createAIClient(provider: 'openai' | 'anthropic' = 'openai') {
  return provider === 'openai' ? new OpenAIClient() : new AnthropicClient();
}

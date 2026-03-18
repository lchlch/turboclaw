/**
 * LLM Provider - 多模型统一接口
 * 
 * 支持 OpenAI 和 Anthropic 格式
 * 默认使用 OpenAI 格式（兼容多数国产模型）
 */

import { LLMProvider, LLMRequest, LLMResponse } from './types.js';

/** OpenAI 格式 Provider */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  
  constructor(private apiKey: string, private baseUrl = 'https://api.openai.com/v1') {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) throw new Error(`LLM API 错误: ${res.status} - ${await res.text()}`);

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content,
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }
}

/** Anthropic 格式 Provider */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  
  constructor(private apiKey: string, private baseUrl = 'https://api.anthropic.com/v1') {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const tools = request.tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(m => ({
          role: m.role === 'system' ? 'user' : m.role,
          content: m.content,
        })),
        tools,
        max_tokens: request.maxTokens || 4000,
        temperature: request.temperature,
      }),
    });

    if (!res.ok) throw new Error(`LLM API 错误: ${res.status} - ${await res.text()}`);

    const data = await res.json();

    return {
      content: data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''),
      toolCalls: data.content
        ?.filter((c: any) => c.type === 'tool_use')
        .map((c: any) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input) },
        })),
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
    };
  }
}

/** Provider 工厂 */
export function createProvider(model: string, apiKey: string, baseUrl?: string): LLMProvider {
  const [provider] = model.split('/');
  
  if (provider === 'anthropic' || provider === 'claude') {
    return new AnthropicProvider(apiKey, baseUrl);
  }
  return new OpenAIProvider(apiKey, baseUrl);
}

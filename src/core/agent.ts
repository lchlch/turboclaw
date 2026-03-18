/**
 * Agent 运行时 - ReAct 范式实现
 * 
 * 核心思想：
 * Think(思考) → Act(行动) → Observe(观察) → Loop(循环)
 * 
 * 状态机：idle → thinking → acting → idle
 * 防御设计：maxDepth 防止无限循环
 */

import { AgentConfig, AgentState, Message, ToolCall, ToolResult, AgentThought, Session, LLMRequest } from './types.js';
import { ToolRegistry } from '../tools/registry.js';
import { createProvider } from './llm.js';
import { randomUUID } from 'crypto';

/** Agent 事件回调 */
export interface AgentCallbacks {
  onStateChange?: (state: AgentState) => void;
  onMessage?: (message: Message) => void;
  onToolCall?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
  onError?: (error: Error) => void;
}

/** Agent 运行时 */
export class Agent {
  private state: AgentState = 'idle';

  constructor(
    private config: AgentConfig,
    private tools: ToolRegistry,
    private callbacks: AgentCallbacks = {}
  ) {}

  getState(): AgentState { return this.state; }

  /** 处理用户输入 - 主入口 */
  async process(input: string, session: Session): Promise<Message> {
    const userMsg: Message = {
      id: randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    this.callbacks.onMessage?.(userMsg);

    const response = await this.reactLoop(session);
    session.messages.push(response);
    session.updatedAt = Date.now();
    
    return response;
  }

  /** ReAct 循环 */
  private async reactLoop(session: Session, depth = 0): Promise<Message> {
    // 防御：最大递归深度
    if (depth >= (this.config.maxToolDepth || 10)) {
      return this.createMessage('assistant', '任务过于复杂，已达到最大处理深度。');
    }

    // Step 1: THINK
    this.setState('thinking');
    const thought = await this.think(session);

    // 无需工具，直接返回
    if (!thought.toolCalls?.length) {
      this.setState('idle');
      return this.createMessage('assistant', thought.content || '');
    }

    // Step 2: ACT
    this.setState('acting');
    
    // 添加 assistant 的 tool_calls 消息到历史（关键！LLM 需要看到完整上下文）
    session.messages.push({
      id: randomUUID(),
      role: 'assistant',
      content: thought.content || '',
      timestamp: Date.now(),
      metadata: { toolCalls: thought.toolCalls },
    });

    const results: ToolResult[] = [];
    for (const call of thought.toolCalls) {
      this.callbacks.onToolCall?.(call);
      const result = await this.executeTool(call);
      results.push(result);
      this.callbacks.onToolResult?.(result);
    }

    // Step 3: OBSERVE - 添加工具结果到上下文
    for (const result of results) {
      session.messages.push({
        id: randomUUID(),
        role: 'tool',
        content: result.error ? `错误: ${result.error}` : result.output,
        timestamp: Date.now(),
        metadata: { toolCallId: result.toolCallId },
      });
    }

    // Step 4: LOOP - 继续思考
    return this.reactLoop(session, depth + 1);
  }

  /** 调用 LLM 思考 */
  private async think(session: Session): Promise<AgentThought> {
    const provider = createProvider(this.config.model, this.config.apiKey, this.config.baseUrl);
    
    // 构建消息历史（兼容 OpenAI 格式）
    const messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> = [
      { role: 'system', content: this.config.systemPrompt || '' },
    ];

    for (const m of session.messages.slice(-20)) {
      if (m.role === 'assistant' && m.metadata?.toolCalls) {
        // Assistant 的消息包含 tool_calls
        messages.push({
          role: 'assistant',
          content: m.content,
          tool_calls: (m.metadata.toolCalls as any[]).map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.parameters) },
          })),
        });
      } else if (m.role === 'tool') {
        // Tool 结果需要关联到对应的 tool_call
        messages.push({
          role: 'tool',
          content: m.content,
          tool_call_id: m.metadata?.toolCallId as string,
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const request: LLMRequest = {
      model: this.config.model.split('/').pop() || this.config.model,
      messages,
      tools: this.tools.toOpenAIFormat(),
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    try {
      const response = await provider.complete(request);
      
      return {
        content: response.content,
        toolCalls: response.toolCalls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments),
        })),
        isComplete: !response.toolCalls?.length,
      };
    } catch (error: any) {
      this.callbacks.onError?.(error);
      return { content: `调用失败: ${error.message}`, isComplete: true };
    }
  }

  /** 执行单个工具 */
  private async executeTool(call: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { toolCallId: call.id, output: '', error: `工具不存在: ${call.name}` };
    }

    try {
      const output = await tool.execute(call.parameters);
      return { toolCallId: call.id, output };
    } catch (e: any) {
      return { toolCallId: call.id, output: '', error: e.message };
    }
  }

  private setState(state: AgentState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private createMessage(role: 'assistant', content: string): Message {
    return { id: randomUUID(), role, content, timestamp: Date.now() };
  }
}

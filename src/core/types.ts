/**
 * 核心类型定义 - 最小化设计
 * 
 * 思想：只保留必要字段，用最简单的结构表达核心概念
 */

/** 消息 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

/** 工具结果 */
export interface ToolResult {
  toolCallId: string;
  output: string;
  error?: string;
}

/** Agent 状态 */
export type AgentState = 'idle' | 'thinking' | 'acting';

/** Agent 配置 */
export interface AgentConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  maxToolDepth?: number;
}

/** Agent 思考结果 */
export interface AgentThought {
  content?: string;
  toolCalls?: ToolCall[];
  isComplete: boolean;
}

/** 工具参数 */
export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

/** 工具定义 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, unknown>) => Promise<string>;
}

/** Channel 配置 */
export interface ChannelConfig {
  type: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/** Channel 接口 */
export interface Channel {
  readonly type: string;
  readonly isConnected: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage?: (message: Message, reply: (msg: Message) => void) => void;
  send(message: Message): Promise<void>;
}

/** Gateway 配置 */
export interface GatewayConfig {
  port: number;
  host?: string;
  authToken?: string;
  workspace: string;
  agent: AgentConfig;
  channels: ChannelConfig[];
}

/** 会话 */
export interface Session {
  id: string;
  channelType: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
}

/** LLM 请求 */
export interface LLMRequest {
  model: string;
  messages: Array<{ 
    role: string; 
    content: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  maxTokens?: number;
  temperature?: number;
}

/** LLM 响应 */
export interface LLMResponse {
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** LLM Provider */
export interface LLMProvider {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

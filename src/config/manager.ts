/**
 * 配置管理器
 * 
 * 配置优先级：环境变量 > 配置文件 > 默认值
 */

import { z } from 'zod';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { SkillConfig } from '../skills/loader.js';

// 配置校验 Schema
const AgentSchema = z.object({
  model: z.string().default('deepseek-chat'),
  apiKey: z.string().default(''),
  baseUrl: z.string().default('https://api.deepseek.com/v1'),
  maxTokens: z.number().default(4000),
  temperature: z.number().default(0.7),
  systemPrompt: z.string().default(`You are an AI assistant that helps users accomplish tasks.

When given a task:
1. Analyze what needs to be done
2. Use available tools to gather information or perform actions
3. Think step by step and explain your reasoning
4. Provide clear, concise responses

Available tools:
- read_file: Read file contents
- write_file: Write content to a file  
- list_files: List directory contents
- bash: Execute shell commands (read-only mode for safety)

Always prefer using tools to get accurate information rather than guessing.`),
  maxToolDepth: z.number().default(10),
});

const ChannelSchema = z.object({
  type: z.enum(['terminal', 'websocket']),
  enabled: z.boolean().default(true),
  options: z.record(z.unknown()).default({}),
});

/**
 * 获取项目根目录（用于确定默认的 skills 目录位置）
 * 在开发时使用 src 的上级目录，在生产时使用 dist 的上级目录
 */
function getProjectRoot(): string {
  try {
    // 使用当前文件的位置来确定项目根目录
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    // 从 src/config/manager.ts 或 dist/config/manager.js 向上找到项目根目录
    return dirname(dirname(currentDir));
  } catch {
    // 如果失败，使用当前工作目录
    return process.cwd();
  }
}

const GatewaySchema = z.object({
  port: z.number().default(18789),
  host: z.string().default('127.0.0.1'),
  authToken: z.string().optional(),
  workspace: z.string().default(join(homedir(), '.turboclaw')),
  // Skills 目录默认在 src/builtin-skills
  // SkillLoader 会优先加载编译后的 .js 文件
  skillsDir: z.string().default(join(getProjectRoot(), 'src', 'builtin-skills')),
  agent: AgentSchema,
  channels: z.array(ChannelSchema).default([{ type: 'terminal', enabled: true, options: {} }]),
  skills: z.array(z.object({
    name: z.string(),
    enabled: z.boolean().default(true),
    config: z.record(z.unknown()).optional(),
  })).default([]),
});

export type Config = z.infer<typeof GatewaySchema> & { skills: SkillConfig[] };

export class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), '.turboclaw', 'config.json');
    this.config = this.load();
  }

  get(): Config { return this.config; }

  private load(): Config {
    // 1. 文件配置
    let fileConfig: any = {};
    if (existsSync(this.configPath)) {
      try { fileConfig = JSON.parse(readFileSync(this.configPath, 'utf-8')); } catch {}
    }

    // 2. 环境变量覆盖
    const envConfig: any = {};
    if (process.env.TURBOCLAW_PORT) envConfig.port = parseInt(process.env.TURBOCLAW_PORT);
    if (process.env.TURBOCLAW_HOST) envConfig.host = process.env.TURBOCLAW_HOST;
    if (process.env.TURBOCLAW_WORKSPACE) envConfig.workspace = process.env.TURBOCLAW_WORKSPACE;
    if (process.env.TURBOCLAW_MODEL || process.env.TURBOCLAW_API_KEY || process.env.TURBOCLAW_BASE_URL) {
      envConfig.agent = {};
      if (process.env.TURBOCLAW_MODEL) envConfig.agent.model = process.env.TURBOCLAW_MODEL;
      if (process.env.TURBOCLAW_API_KEY) envConfig.agent.apiKey = process.env.TURBOCLAW_API_KEY;
      if (process.env.TURBOCLAW_BASE_URL) envConfig.agent.baseUrl = process.env.TURBOCLAW_BASE_URL;
    }

    // 3. 合并并验证（Zod 会自动应用默认值）
    // 注意：不要在这里设置 channels 的默认值，让 Zod 来处理
    const merged = this.merge({ agent: {} }, this.merge(fileConfig, envConfig));
    const result = GatewaySchema.safeParse(merged);
    
    if (!result.success) {
      console.error('配置错误:', result.error.message);
      process.exit(1);
    }
    return result.data;
  }

  initWorkspace(): void {
    if (!existsSync(this.config.workspace)) {
      mkdirSync(this.config.workspace, { recursive: true });
    }
    if (!existsSync(this.configPath)) {
      const defaultConfig: Config = {
        port: 18789,
        host: '127.0.0.1',
        workspace: this.config.workspace,
        // Skills 目录保持默认（项目内），不写入配置文件
        // 使用默认的 skills 目录（src/builtin-skills）
        skillsDir: this.config.skillsDir,
        agent: {
          model: 'deepseek-chat',
          apiKey: 'sk-bc3652e32e9941b6ae56cf6a03b5a0fe',
          baseUrl: 'https://api.deepseek.com/v1',
          maxTokens: 4000,
          temperature: 0.7,
          systemPrompt: `You are an AI assistant with memory capabilities.

CORE CAPABILITIES:
1. Memory - You can remember and recall information across conversations
2. Tools - You can use tools to accomplish tasks
3. Reasoning - You think step by step

MEMORY SYSTEM (IMPORTANT):
- Use 'remember' to save important facts, user preferences, todos, code snippets
- Use 'recall' to retrieve relevant context before answering
- Use 'list_memories' to see what you know
- Always check memory when user refers to past conversations or their preferences

WHEN TO USE MEMORY:
- User says "Remember that..." or "Don't forget..."
- User mentions preferences ("I like...", "I prefer...")
- Important facts that should persist across sessions
- TODOs or action items
- Code snippets user wants to reuse

TOOL USAGE:
- read_file/write_file/list_files: File operations
- bash: Shell commands (read-only, safe mode)
- calculate/convert_unit: Math
- fetch_url/fetch_json: Web requests
- remember/recall/list_memories: Memory operations

WORKFLOW:
1. For user queries: First recall relevant memories, then answer
2. For new information: Remember important facts automatically
3. Always be helpful and concise.`,
          maxToolDepth: 10,
        },
        channels: [
          { type: 'terminal', enabled: true, options: {} },
          { type: 'websocket', enabled: true, options: { port: 18790 } },
        ],
        skills: [
          { name: 'calculator', enabled: true },
          { name: 'fetch', enabled: true },
        ],
      };
      writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
      console.log(`已创建配置: ${this.configPath}`);
    }
  }

  private merge(target: any, source: any): any {
    const result = { ...target };
    for (const key in source) {
      if (source[key] !== undefined) {
        result[key] = typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null
          ? this.merge(result[key] || {}, source[key])
          : source[key];
      }
    }
    return result;
  }
}

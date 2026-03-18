/**
 * Gateway - 控制中心
 * 
 * 职责：
 * 1. 会话管理
 * 2. 消息路由
 * 3. 组件生命周期
 * 
 * 架构：
 * Channel(多个) ←→ Agent(核心) ←→ Tools(注册表)
 *       ↑
 *   Session Manager
 */

import { GatewayConfig, Session, Message, Channel } from './types.js';
import { Agent } from './agent.js';
import { ToolRegistry, createFileSystemTools, createShellTools } from '../tools/registry.js';
import { createChannel } from '../channels/base.js';
import { SkillLoader, SkillConfig } from '../skills/loader.js';
import { MemoryStore, createMemoryTools } from '../memory/store.js';
import { randomUUID } from 'crypto';
import { join } from 'path';

export class Gateway {
  private agent: Agent;
  private tools: ToolRegistry;
  private channels: Channel[] = [];
  private sessions = new Map<string, Session>();
  private skillLoader?: SkillLoader;
  private memoryStore: MemoryStore;

  constructor(private config: GatewayConfig & { skills?: SkillConfig[]; skillsDir?: string }) {
    // 1. 初始化记忆系统
    this.memoryStore = new MemoryStore(config.workspace);

    // 2. 初始化工具
    this.tools = new ToolRegistry();
    this.registerTools();

    // 3. 初始化 Agent
    this.agent = new Agent(config.agent, this.tools, {
      onStateChange: (s) => console.log(`[Agent] ${s}`),
      onToolCall: (c) => console.log(`[Tool] ${c.name}`),
    });

    // 4. 初始化 Channels
    for (const ch of config.channels) {
      if (ch.enabled) {
        const channel = createChannel(ch);
        channel.onMessage = (msg, reply) => this.handleMessage(msg, channel, reply);
        this.channels.push(channel);
      }
    }
  }

  /**
   * 加载 Skills 和 Memory
   */
  async load(): Promise<void> {
    // 初始化 Memory
    await this.memoryStore.init();
    const memories = await this.memoryStore.getAll();
    console.log(`[Memory] ${memories.length} 条记忆`);

    // 加载 Skills
    const skillsDir = (this.config as any).skillsDir || join(this.config.workspace, 'skills');
    const skillConfigs = (this.config as any).skills || [];
    
    this.skillLoader = new SkillLoader(skillsDir);
    const skills = await this.skillLoader.loadSkills(skillConfigs);
    
    // 将 Skill 工具注册到 ToolRegistry
    for (const skill of skills) {
      if (skill.enabled) {
        for (const tool of skill.tools) {
          this.tools.register(tool);
        }
        console.log(`[Skill] 已加载: ${skill.definition.name} (${skill.tools.length} 个工具)`);
      }
    }
  }

  async start(): Promise<void> {
    console.log('🚀 Gateway 启动...');
    console.log(`   工作目录: ${this.config.workspace}`);
    console.log(`   模型: ${this.config.agent.model}`);
    
    // 加载 Skills 和 Memory
    await this.load();
    
    for (const ch of this.channels) await ch.start();
    
    console.log('✅ Gateway 运行中');
  }

  async stop(): Promise<void> {
    console.log('\n🛑 Gateway 停止...');
    for (const ch of this.channels) await ch.stop();
    this.sessions.clear();
  }

  /** 消息处理 - 核心路由 */
  private async handleMessage(msg: Message, channel: Channel, reply: (msg: Message) => void): Promise<void> {
    // 获取或创建会话
    const sessionId = `${channel.type}_${msg.metadata?.clientId || 'default'}`;
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        id: sessionId,
        channelType: channel.type,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      };
      this.sessions.set(sessionId, session);
    }

    try {
      const response = await this.agent.process(msg.content, session);
      response.metadata = { ...response.metadata, clientId: msg.metadata?.clientId };
      reply(response);
    } catch (err: any) {
      reply({
        id: randomUUID(),
        role: 'assistant',
        content: `错误: ${err.message}`,
        timestamp: Date.now(),
        metadata: msg.metadata,
      });
    }
  }

  private registerTools(): void {
    for (const t of createFileSystemTools(this.config.workspace)) this.tools.register(t);
    for (const t of createShellTools(this.config.workspace, false)) this.tools.register(t);
  }

  getSessions(): Session[] { return Array.from(this.sessions.values()); }
  getSession(id: string): Session | undefined { return this.sessions.get(id); }
}

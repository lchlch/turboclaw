#!/usr/bin/env node
/**
 * CLI 入口
 * 
 * 命令：
 * - turboclaw              启动 Gateway
 * - turboclaw init         初始化配置和示例 Skills
 * - turboclaw status       查看状态
 * - turboclaw send         发送消息（非交互）
 * - turboclaw skills       列出已加载的 Skills
 */

import { ConfigManager } from './config/manager.js';
import { Gateway } from './core/gateway.js';
import { Agent } from './core/agent.js';
import { ToolRegistry, createFileSystemTools, createShellTools } from './tools/registry.js';
import { SkillLoader } from './skills/loader.js';
import { MemoryStore, createMemoryTools } from './memory/store.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const command = process.argv[2];

async function main() {
  const configManager = new ConfigManager();

  switch (command) {
    case 'init':
      await initWorkspace(configManager);
      break;

    case 'start':
    case undefined:
      await startGateway(configManager);
      break;

    case 'send':
      await sendMessage(configManager, process.argv[3]);
      break;

    case 'status':
      await showStatus(configManager);
      break;

    case 'skills':
      await listSkills(configManager);
      break;

    case 'memory':
      await manageMemory(configManager, process.argv[3], process.argv[4]);
      break;

    default:
      console.log(`未知命令: ${command}`);
      console.log('用法: turboclaw [init|start|send <message>|status|skills|memory]');
      process.exit(1);
  }
}

async function initWorkspace(manager: ConfigManager): Promise<void> {
  manager.initWorkspace();
  
  const config = manager.get();
  
  // Skills 已内嵌在项目中，无需复制
  // 用户可以手动在项目 skills/ 目录下添加自定义 skills
  console.log(`[Skills] 使用内嵌 Skills: ${config.skillsDir}`);
  
  console.log('\n初始化完成！');
  console.log('你可以:');
  console.log('  1. 编辑配置文件: ~/.turboclaw/config.json');
  console.log('  2. 在项目 src/builtin-skills/ 目录下添加自定义 Skills');
  console.log('  3. 运行: npm start');
}

async function startGateway(manager: ConfigManager): Promise<void> {
  const config = manager.get();
  if (!config.agent.apiKey) {
    console.error('错误: 未设置 API Key');
    console.log('请设置环境变量 TURBOCLAW_API_KEY');
    process.exit(1);
  }

  const gateway = new Gateway(config as any);
  process.on('SIGINT', () => gateway.stop().then(() => process.exit(0)));
  await gateway.start();
}

async function sendMessage(manager: ConfigManager, content?: string): Promise<void> {
  if (!content) {
    console.error('错误: 请提供消息内容');
    process.exit(1);
  }

  const config = manager.get();
  if (!config.agent.apiKey) {
    console.error('错误: 未设置 API Key');
    process.exit(1);
  }

  const tools = new ToolRegistry();
  for (const t of createFileSystemTools(config.workspace)) tools.register(t);
  for (const t of createShellTools(config.workspace, false)) tools.register(t);
  
  // 添加 Memory 工具
  const memoryStore = new MemoryStore(config.workspace);
  await memoryStore.init();
  for (const t of createMemoryTools(memoryStore)) tools.register(t);
  
  // 加载 Skills
  const skillsDir = (config as any).skillsDir || join(config.workspace, 'skills');
  const skillLoader = new SkillLoader(skillsDir);
  const skills = await skillLoader.loadSkills((config as any).skills || []);
  for (const skill of skills) {
    if (skill.enabled) {
      for (const tool of skill.tools) {
        tools.register(tool);
      }
      console.log(`[Skill] ${skill.definition.name}`);
    }
  }

  const agent = new Agent(config.agent, tools, {
    onStateChange: (s) => console.log(`[状态] ${s}`),
    onToolCall: (c) => console.log(`[工具] ${c.name}`),
  });

  const session = {
    id: 'cli', channelType: 'cli', messages: [],
    createdAt: Date.now(), updatedAt: Date.now(), metadata: {},
  };

  const response = await agent.process(content, session);
  console.log(`\nAI: ${response.content}\n`);
}

async function showStatus(manager: ConfigManager): Promise<void> {
  const config = manager.get();
  console.log('=== TurboClaw 状态 ===');
  console.log(`工作目录: ${config.workspace}`);
  console.log(`模型: ${config.agent.model}`);
  console.log(`API Key: ${config.agent.apiKey ? '已设置 ✓' : '未设置 ✗'}`);
  console.log(`Channels: ${config.channels.filter(c => c.enabled).map(c => c.type).join(', ')}`);
  
  const skillsDir = (config as any).skillsDir || join(config.workspace, 'skills');
  console.log(`Skills 目录: ${skillsDir}`);
  
  const loader = new SkillLoader(skillsDir);
  const skills = await loader.loadSkills((config as any).skills || []);
  const enabledSkills = skills.filter(s => s.enabled);
  const totalTools = enabledSkills.reduce((sum, s) => sum + s.tools.length, 0);
  console.log(`Skills: ${enabledSkills.length}/${skills.length} 启用, ${totalTools} 个工具`);
}

async function listSkills(manager: ConfigManager): Promise<void> {
  const config = manager.get();
  const skillsDir = (config as any).skillsDir || join(config.workspace, 'skills');
  const skillConfigs = (config as any).skills || [];
  
  const loader = new SkillLoader(skillsDir);
  const skills = await loader.loadSkills(skillConfigs);
  
  console.log('=== Skills 列表 ===');
  if (skills.length === 0) {
    console.log('(无)');
    console.log(`\n提示: 使用 'turboclaw init' 初始化示例 Skills`);
    return;
  }
  
  for (const skill of skills) {
    const status = skill.enabled ? '✓' : '✗';
    console.log(`\n[${status}] ${skill.definition.name}`);
    console.log(`   描述: ${skill.definition.description}`);
    console.log(`   版本: ${skill.definition.version || 'N/A'}`);
    console.log(`   工具: ${skill.tools.map(t => t.name).join(', ')}`);
  }
}

async function manageMemory(manager: ConfigManager, action?: string, arg?: string): Promise<void> {
  const config = manager.get();
  const store = new MemoryStore(config.workspace);
  await store.init();

  switch (action) {
    case 'add':
      if (!arg) {
        console.log('用法: turboclaw memory add "内容"');
        process.exit(1);
      }
      const entry = await store.add(arg, 'note', ['cli']);
      console.log(`已添加记忆: ${entry.id}`);
      break;

    case 'list':
      const memories = await store.getAll();
      console.log('=== 记忆列表 ===');
      if (memories.length === 0) {
        console.log('(无)');
      } else {
        for (const m of memories.slice(0, parseInt(arg || '10'))) {
          console.log(`\n[${m.type}] ${m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}`);
          console.log(`   标签: ${m.tags.join(', ')}`);
          console.log(`   时间: ${new Date(m.updatedAt).toLocaleString()}`);
        }
      }
      break;

    case 'search':
      if (!arg) {
        console.log('用法: turboclaw memory search "关键词"');
        process.exit(1);
      }
      const results = await store.query({ keywords: arg.split(/\s+/), limit: 5 });
      console.log('=== 搜索结果 ===');
      if (results.length === 0) {
        console.log('(无)');
      } else {
        for (const m of results) {
          console.log(`\n[相关度: ${(m.relevance || 0).toFixed(2)}] ${m.content.slice(0, 80)}...`);
        }
      }
      break;

    default:
      console.log('用法:');
      console.log('  turboclaw memory add "内容"    添加记忆');
      console.log('  turboclaw memory list [数量]   列出记忆');
      console.log('  turboclaw memory search "关键词" 搜索记忆');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

/**
 * Memory 系统 - 长期记忆存储
 * 
 * 设计思想（参考 OpenClaw 但精简）：
 * 1. 记忆是结构化的信息片段
 * 2. 支持按相关性检索
 * 3. 持久化存储为 Markdown（可读性好）
 */

import { Tool } from '../core/types.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type MemoryType = 'fact' | 'todo' | 'user_preference' | 'code' | 'summary' | 'note';

export interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  source?: string;
  relevance?: number;
}

export interface MemoryQuery {
  keywords?: string[];
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  minRelevance?: number;
}

export class MemoryStore {
  private memoryDir: string;
  private memories: Map<string, MemoryEntry> = new Map();
  private initialized: boolean = false;

  constructor(workspace: string) {
    this.memoryDir = join(workspace, '.memory');
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
      this.saveIndex();
    } else {
      this.loadIndex();
    }
    
    this.initialized = true;
  }

  async add(content: string, type: MemoryType = 'note', tags: string[] = [], source?: string): Promise<MemoryEntry> {
    await this.init();

    const entry: MemoryEntry = {
      id: randomUUID(),
      content: content.trim(),
      type,
      tags: [...new Set([...tags, type])],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source,
    };

    this.memories.set(entry.id, entry);
    await this.saveMemory(entry);
    this.saveIndex();

    return entry;
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    await this.init();

    const { keywords = [], type, tags = [], limit = 5, minRelevance = 0.1 } = query;
    
    const results: MemoryEntry[] = [];
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    for (const entry of this.memories.values()) {
      if (type && entry.type !== type) continue;
      if (tags.length > 0 && !tags.some(t => entry.tags.includes(t))) continue;

      let score = 0;
      const contentLower = entry.content.toLowerCase();

      // 关键词匹配
      if (keywords.length > 0) {
        const matches = keywords.filter(kw => 
          contentLower.includes(kw.toLowerCase()) ||
          entry.tags.some(t => t.toLowerCase().includes(kw.toLowerCase()))
        ).length;
        score += (matches / keywords.length) * 0.7;
      }

      // 时间衰减
      const daysOld = (now - entry.updatedAt) / DAY;
      score += Math.exp(-daysOld / 30) * 0.3;

      if (score >= minRelevance) {
        results.push({ ...entry, relevance: score });
      }
    }

    results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    return results.slice(0, limit);
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    await this.init();
    return this.memories.get(id);
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    const deleted = this.memories.delete(id);
    if (deleted) this.saveIndex();
    return deleted;
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.init();
    return Array.from(this.memories.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async saveMemory(entry: MemoryEntry): Promise<void> {
    const filePath = join(this.memoryDir, `${entry.id}.md`);
    const content = `---
id: ${entry.id}
type: ${entry.type}
tags: ${JSON.stringify(entry.tags)}
createdAt: ${entry.createdAt}
updatedAt: ${entry.updatedAt}
source: ${entry.source || ''}
---

${entry.content}
`;
    writeFileSync(filePath, content, 'utf-8');
  }

  private saveIndex(): void {
    const indexPath = join(this.memoryDir, 'index.json');
    const index = Array.from(this.memories.values()).map(m => ({
      id: m.id, type: m.type, tags: m.tags,
      createdAt: m.createdAt, updatedAt: m.updatedAt,
      preview: m.content.slice(0, 100),
    }));
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private loadIndex(): void {
    const indexPath = join(this.memoryDir, 'index.json');
    if (!existsSync(indexPath)) return;

    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      for (const item of index) {
        const filePath = join(this.memoryDir, `${item.id}.md`);
        if (existsSync(filePath)) {
          const content = this.parseMemoryFile(readFileSync(filePath, 'utf-8'));
          this.memories.set(item.id, { ...item, content });
        }
      }
    } catch (e) {
      console.error('[Memory] 加载失败:', e);
    }
  }

  private parseMemoryFile(content: string): string {
    const match = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
    return match ? match[1].trim() : content.trim();
  }
}

// 记忆工具
export function createMemoryTools(store: MemoryStore): Tool[] {
  return [
    {
      name: 'remember',
      description: '记住一条信息到长期记忆。用于保存重要事实、用户偏好、待办事项等。',
      parameters: {
        content: { type: 'string', description: '内容', required: true },
        type: { type: 'string', description: '类型: fact/todo/user_preference/code/note', required: false },
        tags: { type: 'string', description: '标签，逗号分隔', required: false },
      },
      execute: async ({ content, type = 'note', tags = '' }: Record<string, unknown>) => {
        const tagList = (tags as string).split(',').map((t: string) => t.trim()).filter(Boolean);
        const entry = await store.add(content as string, type as MemoryType, tagList);
        return `已记住: ${entry.content.slice(0, 50)}${entry.content.length > 50 ? '...' : ''}`;
      },
    },
    {
      name: 'recall',
      description: '从长期记忆中检索相关信息。',
      parameters: {
        query: { type: 'string', description: '查询关键词', required: true },
        type: { type: 'string', description: '类型过滤', required: false },
        limit: { type: 'number', description: '返回条数，默认3', required: false },
      },
      execute: async ({ query, type, limit = 3 }: Record<string, unknown>) => {
        const keywords = (query as string).split(/\s+/).filter(Boolean);
        const results = await store.query({ keywords, type: type as MemoryType, limit: limit as number });
        if (results.length === 0) return '未找到相关记忆。';
        return results.map((m, i) => `[${i + 1}] ${m.content.slice(0, 80)}...`).join('\n');
      },
    },
    {
      name: 'list_memories',
      description: '列出所有记忆。',
      parameters: {
        type: { type: 'string', description: '类型过滤', required: false },
        limit: { type: 'number', description: '限制，默认10', required: false },
      },
      execute: async ({ type, limit = 10 }: Record<string, unknown>) => {
        let memories = await store.getAll();
        if (type) memories = memories.filter(m => m.type === type);
        memories = memories.slice(0, limit as number);
        return memories.length === 0 ? '没有记忆。' : 
          memories.map((m, i) => `[${i + 1}] ${m.type}: ${m.content.slice(0, 50)}...`).join('\n');
      },
    },
  ];
}

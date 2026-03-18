/**
 * 工具注册表 - Agent 与外部世界交互的桥梁
 * 
 * 思想：
 * - 工具是 Agent 能力的延伸
 * - 每个工具都是纯函数：输入 → 输出
 * - 通过注册表统一管理
 */

import { Tool, ToolParameter } from '../core/types.js';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname } from 'path';

/** 工具注册表 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void { this.tools.set(tool.name, tool); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
  list(): Tool[] { return Array.from(this.tools.values()); }

  /** 转换为 OpenAI 格式 */
  toOpenAIFormat() {
    return this.list().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.entries(tool.parameters).reduce((acc, [key, param]) => {
            acc[key] = { type: param.type, description: param.description };
            return acc;
          }, {} as Record<string, unknown>),
          required: Object.entries(tool.parameters).filter(([, p]) => (p as ToolParameter).required !== false).map(([k]) => k),
        },
      },
    }));
  }
}

/** 创建文件系统工具 */
export function createFileSystemTools(workspace: string): Tool[] {
  const safePath = (p: string): string => {
    const resolved = resolve(workspace, p);
    if (!resolved.startsWith(resolve(workspace))) throw new Error('路径超出工作目录');
    return resolved;
  };

  return [
    {
      name: 'read_file',
      description: '读取文件内容',
      parameters: { path: { type: 'string', description: '文件路径', required: true } },
      execute: async ({ path }) => {
        try {
          const fp = safePath(path as string);
          if (!existsSync(fp)) return `错误: 文件不存在 ${path}`;
          const stat = statSync(fp);
          if (stat.isDirectory()) return `错误: ${path} 是目录`;
          if (stat.size > 1024 * 1024) return `错误: 文件过大`;
          return readFileSync(fp, 'utf-8');
        } catch (e: any) { return `错误: ${e.message}`; }
      },
    },
    {
      name: 'write_file',
      description: '写入文件内容',
      parameters: {
        path: { type: 'string', description: '文件路径', required: true },
        content: { type: 'string', description: '文件内容', required: true },
      },
      execute: async ({ path, content }) => {
        try {
          const fp = safePath(path as string);
          mkdirSync(dirname(fp), { recursive: true });
          writeFileSync(fp, content as string, 'utf-8');
          return `已写入: ${path}`;
        } catch (e: any) { return `错误: ${e.message}`; }
      },
    },
    {
      name: 'list_files',
      description: '列出目录内容',
      parameters: { path: { type: 'string', description: '目录路径', required: false } },
      execute: async ({ path = '.' }) => {
        try {
          const fp = safePath(path as string);
          if (!existsSync(fp)) return `错误: 目录不存在`;
          return readdirSync(fp, { withFileTypes: true })
            .map(i => `${i.isDirectory() ? '[D]' : '[F]'} ${i.name}`)
            .join('\n') || '(空)';
        } catch (e: any) { return `错误: ${e.message}`; }
      },
    },
  ];
}

/** 创建 Shell 工具 */
export function createShellTools(workspace: string, allowUnsafe = false): Tool[] {
  return [{
    name: 'bash',
    description: allowUnsafe ? '执行 bash 命令' : '执行 bash 命令（只读模式）',
    parameters: {
      command: { type: 'string', description: '命令', required: true },
      timeout: { type: 'number', description: '超时(秒)', required: false },
    },
    execute: async ({ command, timeout = 30 }) => {
      try {
        if (!allowUnsafe) {
          const unsafe = ['rm', '>', '>>', ';', '&&', '||'];
          if (unsafe.some(u => (command as string).includes(u))) {
            return '错误: 安全模式下不允许';
          }
        }
        const out = execSync(command as string, { cwd: workspace, timeout: (timeout as number) * 1000, encoding: 'utf-8' });
        return out || '(无输出)';
      } catch (e: any) { return `错误: ${e.message}`; }
    },
  }];
}

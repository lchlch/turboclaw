/**
 * Skill 加载器 - 动态扩展系统
 * 
 * 设计思想：
 * - Skill 是可插拔的功能模块
 * - 每个 Skill 是一个独立目录，包含 SKILL.md 和实现代码
 * - 通过配置启用/禁用 Skills
 * - 支持本地 Skills 和外部 Skills
 * 
 * Skill 目录结构：
 * skills/
 *   my-skill/
 *     SKILL.md       # Skill 定义和说明
 *     index.ts       # Skill 入口（可选）
 * 
 * SKILL.md 格式：
 * ```yaml
 * ---
 * name: my-skill
 * description: 我的自定义技能
 * tools:
 *   - name: my_tool
 *     description: 工具描述
 * ---
 * ```
 */

import { Tool } from '../core/types.js';
import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/** Skill 定义 */
export interface SkillDefinition {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tools: SkillToolDefinition[];
  path: string;
}

/** Skill 工具定义 */
export interface SkillToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
}

/** Skill 实例 */
export interface Skill {
  definition: SkillDefinition;
  tools: Tool[];
  enabled: boolean;
}

/** Skill 配置 */
export interface SkillConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

/** Skill 加载器 */
export class SkillLoader {
  private loadedSkills = new Map<string, Skill>();

  constructor(private skillsDir: string) {}

  /**
   * 扫描并加载所有 Skills
   */
  async loadSkills(configs: SkillConfig[] = []): Promise<Skill[]> {
    const skills: Skill[] = [];
    
    if (!existsSync(this.skillsDir)) {
      return skills;
    }

    const entries = readdirSync(this.skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const skillPath = join(this.skillsDir, entry.name);
      const config = configs.find(c => c.name === entry.name);
      const skill = await this.loadSkill(skillPath, config);
      
      if (skill) {
        skills.push(skill);
        this.loadedSkills.set(skill.definition.name, skill);
      }
    }

    return skills;
  }

  /**
   * 加载单个 Skill
   */
  private async loadSkill(skillPath: string, config?: SkillConfig): Promise<Skill | null> {
    const skillMdPath = join(skillPath, 'SKILL.md');
    
    if (!existsSync(skillMdPath)) {
      return null;
    }

    // 解析 SKILL.md
    const definition = this.parseSkillMd(readFileSync(skillMdPath, 'utf-8'), skillPath);
    if (!definition) {
      return null;
    }

    const enabled = config?.enabled !== false;
    
    // 加载工具实现
    const tools: Tool[] = [];
    if (enabled) {
      const loadedTools = await this.loadSkillTools(skillPath, definition, config?.config);
      tools.push(...loadedTools);
    }

    return {
      definition,
      tools,
      enabled,
    };
  }

  /**
   * 解析 SKILL.md (frontmatter YAML)
   */
  private parseSkillMd(content: string, skillPath: string): SkillDefinition | null {
    // 统一换行符，兼容 Windows (\r\n) 和 Unix (\n)
    const normalizedContent = content.replace(/\r\n/g, '\n');
    const frontmatterMatch = normalizedContent.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const yaml = frontmatterMatch[1];
    const definition: Partial<SkillDefinition> = { path: skillPath, tools: [] };

    // 提取基本字段
    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    if (nameMatch) definition.name = nameMatch[1].trim();

    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    if (descMatch) definition.description = descMatch[1].trim();

    const verMatch = yaml.match(/^version:\s*(.+)$/m);
    if (verMatch) definition.version = verMatch[1].trim();

    const authorMatch = yaml.match(/^author:\s*(.+)$/m);
    if (authorMatch) definition.author = authorMatch[1].trim();

    // 提取 tools 列表
    const toolsMatch = yaml.match(/tools:([\s\S]*?)(?=\n\w|$)/);
    if (toolsMatch) {
      const toolsSection = toolsMatch[1];
      const toolMatches = toolsSection.matchAll(/- name:\s*(\S+)[\s\S]*?description:\s*(.+?)(?=\n  - |\n\w|$)/g);
      
      for (const match of toolMatches) {
        definition.tools!.push({
          name: match[1].trim(),
          description: match[2].trim(),
        });
      }
    }

    if (!definition.name) return null;

    return definition as SkillDefinition;
  }

  /**
   * 加载 Skill 的工具实现
   * 
   * 优先加载编译后的 .js 文件，如果不存在则尝试 .ts（开发模式）
   */
  private async loadSkillTools(
    skillPath: string, 
    definition: SkillDefinition,
    config?: Record<string, unknown>
  ): Promise<Tool[]> {
    // 优先尝试加载编译后的 .js 文件
    const jsPath = join(skillPath, 'index.js');
    const tsPath = join(skillPath, 'index.ts');

    let indexPath: string | null = null;

    if (existsSync(jsPath)) {
      indexPath = jsPath;
    } else if (existsSync(tsPath)) {
      // 开发模式：尝试加载 .ts（需要 tsx）
      indexPath = tsPath;
    }

    if (indexPath) {
      try {
        const module = await import('file://' + resolve(indexPath));
        if (module.default && Array.isArray(module.default)) {
          return module.default;
        }
        if (module.tools && Array.isArray(module.tools)) {
          return module.tools;
        }
      } catch (e: any) {
        // 如果是 .ts 文件加载失败，给出友好提示
        if (indexPath.endsWith('.ts')) {
          console.warn(`[Skill] ${definition.name}: .ts 文件加载失败，请确保使用 tsx 运行或已编译为 .js`);
        } else {
          console.error(`[Skill] 加载失败 ${definition.name}:`, e.message);
        }
      }
    }

    // 从定义生成占位工具
    return definition.tools.map(toolDef => ({
      name: toolDef.name,
      description: toolDef.description,
      parameters: toolDef.parameters || {},
      execute: async () => `工具 ${toolDef.name} 需要实现，请在 ${skillPath}/index.ts 中导出 tools 数组`,
    }));
  }

  getSkill(name: string): Skill | undefined {
    return this.loadedSkills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.loadedSkills.values());
  }

  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    for (const skill of this.loadedSkills.values()) {
      if (skill.enabled) {
        tools.push(...skill.tools);
      }
    }
    return tools;
  }
}

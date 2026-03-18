# 🦞 TurboClaw

> 一个极简、自托管的 AI Agent，受 OpenClaw 启发，仅用 ~1200 行 TypeScript 实现核心功能。

## ✨ 特性

- **🧠 ReAct Agent** - Think → Act → Observe → Loop
- **💾 Memory 系统** - 长期记忆存储与检索（参考 OpenClaw）
- **🔧 工具系统** - 内置文件操作、Shell 命令
- **🧩 Skills 系统** - 可插拔的功能扩展模块
- **📡 双 Channel** - Terminal + WebSocket
- **🔌 多模型** - OpenAI / Anthropic / DeepSeek 等

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 初始化配置
npm run dev -- init

# 3. 启动（使用默认 DeepSeek 配置，自动加载内置 Skills）
npm run dev
```

## 📁 项目结构

```
src/
├── core/
│   ├── types.ts          # 核心类型定义
│   ├── agent.ts          # ReAct Agent 运行时
│   ├── gateway.ts        # 控制中心
│   └── llm.ts            # LLM Provider
├── channels/
│   └── base.ts           # Channel 实现
├── tools/
│   └── registry.ts       # 工具注册表
├── skills/
│   └── loader.ts         # Skill 加载器
├── builtin-skills/       # 内置示例 Skills
│   ├── calculator/       # 数学计算 Skill
│   │   ├── SKILL.md
│   │   └── index.ts
│   └── fetch/            # HTTP 请求 Skill
│       ├── SKILL.md
│       └── index.ts
├── config/
│   └── manager.ts        # 配置管理
├── cli.ts                # CLI 入口
└── index.ts              # 库入口
```

## 🏗️ 架构

```
┌─────────────────────────────────────────┐
│            Gateway                      │
│  ┌─────┐  ┌─────┐  ┌─────────────────┐ │
│  │ Ch  │←→│Agent│←→│ ToolRegistry    │ │
│  └─────┘  └─────┘  │ + Skills        │ │
│       ↑            └─────────────────┘ │
│  ┌─────────┐                           │
│  │ Session │                           │
│  └─────────┘                           │
└─────────────────────────────────────────┘
```

## 🛠️ 内置工具

### 文件工具
| 工具 | 描述 |
|------|------|
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `list_files` | 列出目录 |
| `bash` | 执行命令（安全模式）|

### Memory 工具（长期记忆）
| 工具 | 描述 |
|------|------|
| `remember` | 保存信息到长期记忆 |
| `recall` | 检索相关记忆 |
| `list_memories` | 列出所有记忆 |
| `forget` | 删除记忆 |

## 🧩 Skills 系统

TurboClaw 支持通过 Skills 动态扩展功能。Skills 是可插拔的模块，包含一组相关工具。

### 内置 Skills

| Skill | 工具 | 描述 |
|-------|------|------|
| `calculator` | `calculate` | 数学计算 |
| | `convert_unit` | 单位转换 |
| `fetch` | `fetch_url` | 获取网页内容 |
| | `fetch_json` | 获取 JSON API |

### 创建自定义 Skill

```bash
# 1. 在 src/builtin-skills 目录创建新 Skill
mkdir src/builtin-skills/my-skill

# 2. 创建 SKILL.md 定义
cat > src/builtin-skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: 我的自定义技能
version: 1.0.0
tools:
  - name: hello
    description: 打招呼工具
---
EOF

# 3. 创建 index.ts 实现
cat > src/builtin-skills/my-skill/index.ts << 'EOF'
import { Tool } from '../../core/types.js';

const helloTool: Tool = {
  name: 'hello',
  description: '打招呼工具',
  parameters: {
    name: { type: 'string', description: '名字', required: true }
  },
  execute: async ({ name }) => `Hello, ${name}!`
};

export default [helloTool];
EOF

# 4. 添加到配置 ~/.turboclaw/config.json
{
  "skills": [
    { "name": "calculator", "enabled": true },
    { "name": "fetch", "enabled": true },
    { "name": "my-skill", "enabled": true }
  ]
}
```

### Skill 命令

```bash
# 查看已加载的 Skills（内置 Skills 已包含在项目中）
turboclaw skills

# 查看状态（包含 Skills 信息）
turboclaw status

# 添加自定义 Skill 到 src/builtin-skills/ 目录后重启即可加载
```

## 🧠 Memory 系统

TurboClaw 支持长期记忆，参考 OpenClaw 的设计但更加精简。

### Memory 特点

- **持久化存储**：记忆保存为 Markdown 文件，人类可读
- **相关性检索**：基于关键词匹配 + 时间衰减
- **类型分类**：fact, todo, user_preference, code, note
- **自动提取**：可从对话中自动提取用户偏好

### 使用示例

```bash
# Agent 自动使用 Memory
$ turboclaw send "记住我叫 Alice"
[工具] remember
AI: 已记住您的名字是 Alice

$ turboclaw send "我叫什么名字？"
[工具] recall
AI: 您的名字是 Alice

# 手动管理 Memory
$ turboclaw memory add "重要信息"
$ turboclaw memory list
$ turboclaw memory search "关键词"
```

### 记忆存储位置

```
~/.turboclaw/.memory/
├── index.json           # 索引
├── {uuid}.md            # 记忆文件（Markdown 格式）
└── ...
```

记忆文件格式：
```markdown
---
id: xxx
type: user_preference
tags: ["name", "user_preference"]
createdAt: 1234567890
updatedAt: 1234567890
---

用户名字叫 Alice，喜欢 TypeScript
```

## ⚙️ 配置

### 环境变量

```bash
TURBOCLAW_API_KEY       # LLM API Key
TURBOCLAW_MODEL         # 模型，默认 deepseek-chat
TURBOCLAW_BASE_URL      # 自定义 API 端点
TURBOCLAW_WORKSPACE     # 工作目录
```

### 配置文件

`~/.turboclaw/config.json`:

```json
{
  "workspace": "/path/to/workspace",
  "skillsDir": "/path/to/project/src/builtin-skills",
  "agent": {
    "model": "deepseek-chat",
    "apiKey": "your_key",
    "maxToolDepth": 10
  },
  "channels": [
    { "type": "terminal", "enabled": true },
    { "type": "websocket", "enabled": true, "options": { "port": 18790 } }
  ],
  "skills": [
    { "name": "calculator", "enabled": true },
    { "name": "fetch", "enabled": true }
  ]
}
```

## 📝 使用示例

### Terminal 模式

```bash
$ npm start

🚀 Gateway 启动...
   工作目录: ~/.turboclaw
   模型: deepseek-chat
   Skills 目录: src/builtin-skills
[Skill] 已加载: calculator (2 个工具)
[Skill] 已加载: fetch (2 个工具)
✅ Gateway 运行中
🦞 TurboClaw Terminal
输入消息，/quit 退出

You: 计算 2 + 2 * 3
[Agent] thinking
[Tool] calculate
[Agent] acting
[Agent] idle

AI: 结果是 8
```

### 非交互模式

```bash
npm run dev -- send "计算 sqrt(16) + 5"
```

### WebSocket 客户端

```javascript
const ws = new WebSocket('ws://localhost:18790');
ws.onopen = () => ws.send(JSON.stringify({ type: 'message', content: '你好!' }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## 🔌 模型支持

```bash
# DeepSeek (默认)
export TURBOCLAW_API_KEY=sk-xxx
export TURBOCLAW_MODEL=deepseek-chat
export TURBOCLAW_BASE_URL=https://api.deepseek.com/v1

# OpenAI
export TURBOCLAW_API_KEY=sk-xxx
export TURBOCLAW_MODEL=openai/gpt-4o-mini

# Anthropic
export TURBOCLAW_API_KEY=sk-ant-xxx
export TURBOCLAW_MODEL=anthropic/claude-3-sonnet
```

## 📊 代码统计

| 文件 | 行数 | 说明 |
|------|------|------|
| types.ts | 132 | 类型定义 |
| agent.ts | 167 | ReAct 核心 |
| gateway.ts | 128 | 控制中心 |
| llm.ts | 100 | 模型接口 |
| registry.ts | 115 | 工具系统 |
| **store.ts** | **202** | **Memory 系统** |
| **loader.ts** | **206** | **Skill 系统** |
| channels/base.ts | 92 | 双通道 |
| config/manager.ts | 155 | 配置管理 |
| cli.ts | 221 | CLI 入口 |
| **总计** | **~1500** | **含 Memory + Skills** |

## 🆚 与 OpenClaw 对比

| 特性 | TurboClaw | OpenClaw |
|------|-----------|----------|
| 代码量 | ~1200 行 | ~43 万行 |
| Channels | 2 种 | 20+ 种 |
| Skills | 支持 | 支持 |
| 工具 | 4 + Skills | 丰富生态 |
| 部署 | 单文件 | Docker + 多服务 |

**适用场景**：
- ✅ 学习 AI Agent 架构
- ✅ 快速原型开发
- ✅ 轻量级自动化
- ❌ 生产级复杂需求

## 📜 许可

MIT License

> 致敬 OpenClaw 团队 🦞

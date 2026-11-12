# 🦞 TurboClaw

> 极简、自托管的 AI Agent，受 OpenClaw 启发，用 TypeScript 实现核心能力。

TurboClaw 把 AI Agent 拆成几个小模块：ReAct 循环、Channel、工具注册表、Memory、Skill 和配置管理。没有数据库，也没有前端框架，核心代码约 2,000 行，适合阅读、改造和嵌入自己的项目。

## ✨ 特性

- **ReAct Agent**：`Think → Act → Observe → Loop`，带最大轮数保护。
- **双 Channel**：终端交互 + WebSocket（附网页示例）。
- **工具系统**：文件读写、目录浏览、受限制的 Shell；工具统一注册，并自动转成 LLM 的 function schema。
- **Memory**：Markdown 持久化、关键词 + 时间衰减检索，支持 CLI 管理和 Agent 工具。
- **Skills**：`SKILL.md` 声明 + `index.ts` 实现，放入目录即可被发现；内置计算器和 HTTP 请求两个 Skill。
- **多模型**：OpenAI 兼容接口（DeepSeek / OpenAI / 其他兼容服务）和 Anthropic Messages API。
- **配置分层**：环境变量 > `~/.turboclaw/config.json` > 默认值，Zod 校验。
- **依赖少**：运行时只依赖 `ws` 和 `zod`，要求 Node.js >= 20。

## 🚀 快速开始

环境要求：Node.js >= 20、npm。

```bash
# 1. 安装依赖
npm install

# 2. 初始化工作目录和配置（写入 ~/.turboclaw/config.json）
npm run dev -- init

# 3. 设置 API Key（推荐用环境变量；也可以改配置文件里的 agent.apiKey）
export TURBOCLAW_API_KEY=sk-your-key

# 4. 启动（默认读取 ~/.turboclaw/config.json）
npm run dev
```

开发模式用 `tsx` 直接运行 TypeScript，不需要先构建。启动后：

- 终端 Channel 进入交互模式，输入 `/quit` 退出；
- 如果配置启用了 WebSocket Channel，会同时监听 `ws://localhost:18790`。

`init` 只创建不存在的文件；重复执行不会覆盖已有配置。

### 构建后运行

```bash
npm run build
npm start
```

`npm start` 执行 `node dist/cli.js`。构建产物和内置 Skill 的注意事项见 [已知限制](#known-limitations)。

## 🖥️ CLI

开发时在命令前加 `npm run dev --`；构建后可用 `npm start --`（或 `node dist/cli.js`）；构建后执行 `npm link`，就可以直接使用 `turboclaw`。

| 命令 | 说明 |
|---|---|
| `turboclaw` / `turboclaw start` | 启动 Gateway：加载 Memory、Skills，启动启用的 Channel |
| `turboclaw init` | 创建 `~/.turboclaw` 工作目录和默认配置 |
| `turboclaw send "<消息>"` | 单次调用 Agent，打印回复后退出；注册文件、Shell、Memory 和 Skill 工具 |
| `turboclaw status` | 显示工作目录、模型、API Key 是否设置、启用的 Channel、Skills 统计 |
| `turboclaw skills` | 列出发现的 Skills、版本和工具 |
| `turboclaw memory add "<内容>"` | 添加一条 `note` 类型的记忆（标签 `cli`） |
| `turboclaw memory list [数量]` | 按更新时间倒序列出记忆，默认 10 条 |
| `turboclaw memory search "<关键词>"` | 按相关度搜索记忆，返回前 5 条 |

示例：

```bash
npm run dev -- status
npm run dev -- skills
npm run dev -- send "计算 sqrt(16) + 5"
npm run dev -- memory add "项目使用 Node.js 20"
npm run dev -- memory search "Node"
```

注意：`start` / `send` 需要能读到 API Key，否则直接报错退出；`init`、`status`、`skills`、`memory` 不调用 LLM。`send` 每次都是新会话，跨会话的信息请用 Memory 保存。

## 🏗️ 架构

```
                    ┌──────────────────────────────┐
                    │           Gateway            │
  Terminal ────────▶│  会话管理 + 消息路由         │
  WebSocket ───────▶│                              │
                    └──────────────┬───────────────┘
                                   │ process(input, session)
                                   ▼
                    ┌──────────────────────────────┐
                    │            Agent             │
                    │ ReAct: think → act → observe │
                    └──────┬───────────────┬───────┘
                           │               │
                           ▼               ▼
                    ┌────────────┐  ┌─────────────┐
                    │ LLMProvider│  │ ToolRegistry│
                    │ OpenAI /   │  │ 内置工具    │
                    │ Anthropic  │  │ + Skills    │
                    └────────────┘  └─────────────┘
```

- **Gateway**：按 `channelType_clientId` 建会话，把消息交给 Agent，再把回复路由回对应 Channel。会话只存在内存中，进程退出即丢失。
- **Agent**：每个用户输入进入 ReAct 循环；LLM 返回 `tool_calls` 就执行工具、把结果写回上下文，再次调用 LLM，直到没有工具调用或达到 `maxToolDepth`（默认 10）。每次请求只带最近 20 条会话消息。
- **LLM Provider**：`createProvider()` 根据模型名前缀选择实现；非 `anthropic/`、`claude/` 前缀一律走 OpenAI 兼容格式。
- **ToolRegistry**：统一注册工具，并转换成 OpenAI function calling 的 schema；Skill 工具也注册到同一张表。

## 🛠️ 内置工具

文件工具都限制在 `workspace` 内：路径会先解析为绝对路径，再检查是否以工作目录开头。

| 工具 | 参数 | 说明 |
|---|---|---|
| `read_file` | `path` | 读取 UTF-8 文本，最大 1 MB，不能是目录 |
| `write_file` | `path`, `content` | 写入文本，自动创建父目录 |
| `list_files` | `path`（可选，默认 `.`） | 列出目录，`[D]` 表示目录、`[F]` 表示文件 |
| `bash` | `command`, `timeout`（秒，默认 30） | 在 `workspace` 下执行命令 |

`bash` 默认是“安全模式”：命令字符串里只要包含 `rm`、`>`、`>>`、`;`、`&&`、`||` 就拒绝执行。它只是关键字过滤，**不是安全沙箱**；不要在工作目录里放敏感文件。

## 🧠 Memory 系统

记忆保存在 `<workspace>/.memory/`（默认 `~/.turboclaw/.memory/`）：

```
.memory/
├── index.json     # 索引：id、type、tags、时间、内容预览
└── <uuid>.md      # 每条记忆一个 Markdown 文件
```

记忆文件格式：

```markdown
---
id: 2d4a837a-...
type: note
tags: ["cli","note"]
createdAt: 1794455103606
updatedAt: 1794455103606
source:
---

项目使用 Node.js 20
```

支持的类型：`fact`、`todo`、`user_preference`、`code`、`summary`、`note`。

检索规则（`MemoryStore.query()`）：

- `type` 精确过滤；`tags` 命中任意一个即可；
- 关键词在正文或标签中出现，得分为 `0.7 × 命中比例`；
- 时间衰减为 `0.3 × exp(-距今天数 / 30)`；
- 低于 `minRelevance`（默认 0.1）的结果丢弃，按得分降序，默认返回 5 条。

Agent 侧的 Memory 工具：

| 工具 | 参数 | 说明 |
|---|---|---|
| `remember` | `content`、`type`（可选）、`tags`（逗号分隔，可选） | 保存一条记忆 |
| `recall` | `query`、`type`（可选）、`limit`（默认 3） | 按空白拆分关键词检索 |
| `list_memories` | `type`（可选）、`limit`（默认 10） | 列出记忆 |

> 目前这三个工具只在 `turboclaw send` 的 Agent 中注册；`turboclaw` / `start` 的 Gateway 只初始化了 MemoryStore，尚未注册记忆工具。CLI 的 `memory` 命令始终可用。

## 🧩 Skills 系统

Skill 是一个带 `SKILL.md` 的目录，加载器会扫描 `skillsDir`（默认项目里的 `src/builtin-skills`）下的所有子目录。

```
<skillsDir>/
└── my-skill/
    ├── SKILL.md     # 元数据：name、description、version、tools
    └── index.ts     # 工具实现：默认导出 Tool[]
```

`SKILL.md`：

```markdown
---
name: my-skill
description: 我的自定义技能
version: 1.0.0
author: me
tools:
  - name: hello
    description: 打招呼
---
```

`index.ts`：

```ts
import type { Tool } from '../../core/types.js';

const helloTool: Tool = {
  name: 'hello',
  description: '打招呼',
  parameters: {
    name: { type: 'string', description: '名字', required: true },
    greeting: { type: 'string', description: '问候语', required: false },
  },
  execute: async ({ name, greeting = 'Hello' }) => `${greeting}, ${name}!`,
};

export default [helloTool];
```

加载规则：

- 优先加载 `index.js`，其次 `index.ts`；`.ts` 需要 `tsx`（开发模式），纯 Node 运行时请先编译；
- `index.ts` / `index.js` 未找到或导入失败时，加载器会根据 `SKILL.md` 生成占位工具，调用时提示“需要实现”；
- 目录名要和 `SKILL.md` 里的 `name` 一致；配置里通过目录名启用/禁用；
- 参数默认是必填的，可选参数要显式写 `required: false`；
- 配置 `skills` 里没列出的 Skill 默认启用，写 `{ "name": "my-skill", "enabled": false }` 可禁用。

### 内置 Skills

| Skill | 工具 | 说明 |
|---|---|---|
| `calculator` | `calculate` | 数学表达式：`+ - * / ^`、`sqrt`、`abs`、`pow`、`sin`、`cos`、`tan`、`log`、`PI`、`E` |
| | `convert_unit` | 长度 m/km/cm/mm/ft/in/mi；重量 kg/g/mg/lb/oz；温度 C↔F、C↔K |
| `fetch` | `fetch_url` | GET 一个 URL，返回文本；HTML 会去标签，默认最多 5000 字符 |
| | `fetch_json` | GET 一个 JSON API，格式化返回 |

示例：`calculate` 的 `2 + 2 * 3` 返回 `结果: 8`，`sqrt(16) + abs(-5)` 返回 `结果: 9`。

> `fetch_url` / `fetch_json` 没有超时和 SSRF 防护，只适合访问可信地址。

## ⚙️ 配置

配置文件默认是 `~/.turboclaw/config.json`，由 `init` 生成。优先级：环境变量 > 配置文件 > 默认值；校验失败会打印错误并退出。

### 环境变量

| 变量 | 对应配置 | 说明 |
|---|---|---|
| `TURBOCLAW_API_KEY` | `agent.apiKey` | LLM API Key |
| `TURBOCLAW_MODEL` | `agent.model` | 模型名，默认 `deepseek-chat` |
| `TURBOCLAW_BASE_URL` | `agent.baseUrl` | API 地址，默认 DeepSeek |
| `TURBOCLAW_WORKSPACE` | `workspace` | 工作目录，默认 `~/.turboclaw` |
| `TURBOCLAW_PORT` | `port` | 预留字段，当前网络层没有使用 |
| `TURBOCLAW_HOST` | `host` | 预留字段，当前网络层没有使用 |

### 配置文件示例

```json
{
  "port": 18789,
  "host": "127.0.0.1",
  "workspace": "/home/me/.turboclaw",
  "skillsDir": "/path/to/turboclaw/src/builtin-skills",
  "agent": {
    "model": "deepseek-chat",
    "apiKey": "sk-your-key",
    "baseUrl": "https://api.deepseek.com/v1",
    "maxTokens": 4000,
    "temperature": 0.7,
    "maxToolDepth": 10,
    "systemPrompt": "You are a helpful assistant."
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

字段说明：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `workspace` | `~/.turboclaw` | 工具和 Memory 的根目录 |
| `skillsDir` | `<项目根>/src/builtin-skills` | Skill 扫描目录 |
| `agent.model` | `deepseek-chat` | 见下方“模型” |
| `agent.apiKey` | 空；`init` 会填入一个默认值，请替换为自己的 Key | 建议用 `TURBOCLAW_API_KEY`，不要提交到仓库 |
| `agent.baseUrl` | `https://api.deepseek.com/v1` | OpenAI 兼容或 Anthropic 的 API 根地址 |
| `agent.maxTokens` | `4000` | 请求的最大输出 token |
| `agent.temperature` | `0.7` | 采样温度 |
| `agent.maxToolDepth` | `10` | ReAct 最大轮数 |
| `agent.systemPrompt` | 内置提示词 | 系统提示词 |
| `channels` | `[{ "type": "terminal", "enabled": true }]` | 启用的 Channel；`init` 会写入 terminal + websocket |
| `skills` | `[]` | 仅用于启用/禁用/传配置，未列出的 Skill 默认启用 |
| `port` / `host` / `authToken` | `18789` / `127.0.0.1` / 无 | 预留字段，当前实现未使用；WebSocket 端口看 `channels[].options.port` |

## 🔌 模型

`agent.model` 用 `provider/model` 的形式选择接口，实际发给 API 的是最后一个 `/` 后面的部分：

- `anthropic/...` 或 `claude/...` → Anthropic Messages API；
- 其他 → OpenAI 兼容的 `/chat/completions`。

因此换模型时通常要同时改 `baseUrl`：

```bash
# DeepSeek（默认）
export TURBOCLAW_API_KEY=sk-...
export TURBOCLAW_MODEL=deepseek-chat
export TURBOCLAW_BASE_URL=https://api.deepseek.com/v1

# OpenAI
export TURBOCLAW_API_KEY=sk-...
export TURBOCLAW_MODEL=openai/gpt-4o-mini
export TURBOCLAW_BASE_URL=https://api.openai.com/v1

# Anthropic
export TURBOCLAW_API_KEY=sk-ant-...
export TURBOCLAW_MODEL=anthropic/claude-3-5-sonnet-latest
export TURBOCLAW_BASE_URL=https://api.anthropic.com/v1
```

Anthropic 的 `max_tokens` 默认 4000。其他 OpenAI 兼容服务只要支持 `/chat/completions` 和 function calling，填对 `baseUrl` 即可。

## 📡 WebSocket

在配置里启用 `websocket` Channel 后启动 Gateway，客户端连接 `ws://localhost:18790`。消息格式：

```js
const ws = new WebSocket('ws://localhost:18790');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'connected') {
    // 服务端分配 clientId，同一连接共用会话
    ws.send(JSON.stringify({ type: 'message', content: '你好' }));
  } else if (data.type === 'message') {
    console.log(data.role, data.content);
  }
};
```

- 连接成功：`{"type":"connected","clientId":"..."}`；
- 客户端发消息：`{"type":"message","content":"..."}`；
- 助手回复：`{"type":"message","id":"...","role":"assistant","content":"...","timestamp":...,"metadata":{"clientId":"..."}}`；
- 非 JSON：`{"type":"error","message":"格式错误"}`；其他 `type` 会被忽略。

浏览器示例在 [`examples/web-client.html`](examples/web-client.html)，直接用浏览器打开即可（默认连 `ws://localhost:18790`）。

## 📁 项目结构

```
src/
├── cli.ts                 # CLI 入口
├── index.ts               # 库入口
├── core/
│   ├── types.ts           # 核心类型
│   ├── agent.ts           # ReAct Agent
│   ├── gateway.ts         # 会话/路由/生命周期
│   └── llm.ts             # OpenAI / Anthropic Provider
├── channels/
│   └── base.ts            # Terminal + WebSocket Channel
├── tools/
│   └── registry.ts        # 工具注册表 + 文件/Shell 工具
├── memory/
│   └── store.ts           # Memory 存储、检索和工具
├── skills/
│   └── loader.ts          # SKILL.md 解析 + 工具加载
├── config/
│   └── manager.ts         # 配置加载/合并/校验
└── builtin-skills/
    ├── calculator/        # 计算与单位换算
    └── fetch/             # HTTP GET / JSON
examples/
├── test-tool.js           # 工具自检脚本
└── web-client.html        # WebSocket 网页客户端
```

构建后运行 `node examples/test-tool.js` 可以跑一遍文件工具、Shell 工具和路径越界检查。

## 🧪 开发与验证

```bash
npm run dev                  # tsx 直接运行 TypeScript
npm run build                # tsc 输出到 dist/
npm start                    # 运行 dist/cli.js
node examples/test-tool.js   # 需要先 npm run build
```

项目当前没有配置单元测试框架；验证主要靠 `examples/test-tool.js`、`npm run dev -- status/skills` 和实际对话。

## 🔒 安全说明

- 文件工具会把路径解析到 `workspace` 下，并检查结果是否以工作目录开头；这是简单的路径检查，不是完整沙箱；
- `bash` 的安全模式只是关键字过滤，不是沙箱；
- WebSocket 没有鉴权，默认监听所有网卡的 18790 端口；不要直接暴露到公网；
- API Key 建议放环境变量或本地配置，不要提交到仓库。

<a id="known-limitations"></a>
## ⚠️ 已知限制

- Gateway 交互模式（`turboclaw` / `start`）尚未注册 `remember` / `recall` / `list_memories` 工具；需要 Agent 记忆时用 `turboclaw send`，或先用 CLI 的 `memory` 命令。
- `npm run build` 只编译 TypeScript，不会复制 `SKILL.md`；默认 `skillsDir` 又指向 `src/builtin-skills`。因此 `npm start` 下 Node 无法直接导入 `.ts` Skill，会回退成占位工具。开发时用 `npm run dev`；生产运行前把 `SKILL.md` 复制到包含编译后 `index.js` 的目录，并把 `skillsDir` 指向那里（例如 `dist/builtin-skills`）。
- 配置里的 `port`、`host`、`authToken` 目前没有接入网络层；WebSocket 端口只由 `channels[].options.port` 控制。
- `fetch_url` / `fetch_json` 没有超时、重试和 SSRF 防护。
- 会话只存在内存中，重启后历史消息丢失；Memory 是唯一的持久化状态。

## 📜 许可

MIT License

> 致敬 OpenClaw 🦞

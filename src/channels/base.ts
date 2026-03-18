/**
 * Channel 层 - 用户交互界面
 * 
 * 实现：
 * - Terminal: 命令行交互
 * - WebSocket: 网络交互
 */

import { Channel, ChannelConfig, Message } from '../core/types.js';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

/** Terminal Channel */
export class TerminalChannel implements Channel {
  readonly type = 'terminal';
  isConnected = false;
  onMessage?: (message: Message, reply: (msg: Message) => void) => void;
  private rl?: ReturnType<typeof createInterface>;

  async start(): Promise<void> {
    this.rl = createInterface({ input: process.stdin, output: process.stdout });
    this.isConnected = true;
    console.log('🦞 TurboClaw Terminal\n输入消息，/quit 退出\n');
    this.prompt();
  }

  private prompt(): void {
    this.rl?.question('You: ', (input) => {
      if (!this.isConnected) return;
      if (input.trim() === '/quit') { this.stop(); return; }

      this.onMessage?.(
        { id: randomUUID(), role: 'user', content: input, timestamp: Date.now() },
        (reply) => { console.log(`\nAI: ${reply.content}\n`); this.prompt(); }
      );
    });
  }

  async stop(): Promise<void> {
    this.isConnected = false;
    this.rl?.close();
    console.log('再见！');
    process.exit(0);
  }

  async send(message: Message): Promise<void> {
    console.log(`\nAI: ${message.content}\n`);
  }
}

/** WebSocket Channel */
export class WebSocketChannel implements Channel {
  readonly type = 'websocket';
  isConnected = false;
  onMessage?: (message: Message, reply: (msg: Message) => void) => void;
  private server?: any;
  private clients = new Map<string, any>();

  constructor(private port: number) {}

  async start(): Promise<void> {
    const { WebSocketServer } = await import('ws');
    this.server = new WebSocketServer({ port: this.port });
    this.isConnected = true;

    this.server.on('connection', (ws: any) => {
      const clientId = randomUUID();
      this.clients.set(clientId, ws);
      ws.send(JSON.stringify({ type: 'connected', clientId }));

      ws.on('message', (data: Buffer) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.type === 'message') {
            this.onMessage?.(
              { id: randomUUID(), role: 'user', content: payload.content, timestamp: Date.now(), metadata: { clientId } },
              (reply) => ws.send(JSON.stringify({ type: 'message', ...reply }))
            );
          }
        } catch { ws.send(JSON.stringify({ type: 'error', message: '格式错误' })); }
      });

      ws.on('close', () => this.clients.delete(clientId));
    });

    console.log(`[WebSocket] ws://localhost:${this.port}`);
  }

  async stop(): Promise<void> {
    this.isConnected = false;
    this.server?.close();
    this.clients.forEach(ws => ws.close());
    this.clients.clear();
  }

  async send(message: Message): Promise<void> {
    const clientId = message.metadata?.clientId as string;
    this.clients.get(clientId)?.send(JSON.stringify({ type: 'message', ...message }));
  }
}

/** Channel 工厂 */
export function createChannel(config: ChannelConfig): Channel {
  switch (config.type) {
    case 'terminal': return new TerminalChannel();
    case 'websocket': return new WebSocketChannel((config.options?.port as number) || 18790);
    default: throw new Error(`未知 Channel: ${config.type}`);
  }
}

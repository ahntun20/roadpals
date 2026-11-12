import type { Redis } from 'ioredis';
import type { ServerMsg } from '@roadpals/shared';
import type { WebSocket } from 'ws';

const CHANNEL = 'rp:u:';

/**
 * Delivers messages to a user's open WebSockets. Messages go through Redis pub/sub,
 * so any server instance can reach a user connected to any other instance.
 */
export class Hub {
  private sockets = new Map<string, Set<WebSocket>>();

  constructor(private pub: Redis, private sub: Redis) {}

  async start(): Promise<void> {
    // Subscribing before the connection is ready breaks ioredis' ready check and silently
    // stops all realtime delivery, so wait for 'ready' first.
    if (this.sub.status !== 'ready') await new Promise<void>((resolve, reject) => {
      this.sub.once('ready', () => resolve());
      this.sub.once('end', () => reject(new Error('Redis subscriber connection closed')));
    });
    await this.sub.psubscribe(`${CHANNEL}*`);
    this.sub.on('pmessage', (_p, channel, message) => {
      const uid = channel.slice(CHANNEL.length);
      const set = this.sockets.get(uid);
      if (!set) return;
      for (const ws of set) if (ws.readyState === 1) ws.send(message);
    });
  }

  add(uid: string, ws: WebSocket): void {
    let set = this.sockets.get(uid);
    if (!set) this.sockets.set(uid, (set = new Set()));
    set.add(ws);
    ws.on('close', () => {
      set!.delete(ws);
      if (!set!.size) this.sockets.delete(uid);
    });
  }

  send = (uid: string, msg: ServerMsg): void => {
    void this.pub.publish(CHANNEL + uid, JSON.stringify(msg));
  };

  isOnline(uid: string): boolean {
    return this.sockets.has(uid);
  }

  connections(): number {
    let n = 0;
    for (const s of this.sockets.values()) n += s.size;
    return n;
  }
}

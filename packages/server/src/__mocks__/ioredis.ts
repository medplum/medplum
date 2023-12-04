const subscribers = new Map<string, Set<Redis>>();

class Redis {
  private values: Map<string, string>;
  private listeners: Map<string, ((...args: any[]) => void)[]>;

  constructor(readonly config: any) {
    this.values = new Map<string, string>();
    this.listeners = new Map<string, ((...args: any[]) => void)[]>();
  }

  on(event: string, callback: (...args: any[]) => void): void {
    this.listeners.set(event, [callback]);
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async mget(...keys: string[]): Promise<(string | undefined)[]> {
    return keys.map((key) => this.values.get(key));
  }

  async set(key: string, value: string, ...args: (string | number)[]): Promise<undefined | null | string> {
    let oldValue;
    if (args.includes('GET')) {
      oldValue = this.values.get(key) ?? null; // `ioredis` returns `null` when key didn't previously exist
    }
    if (args.includes('NX') && this.values.has(key)) {
      return oldValue;
    }
    this.values.set(key, value);
    return oldValue;
  }

  async del(key: string | string[]): Promise<void> {
    if (Array.isArray(key)) {
      key.forEach((k) => {
        this.values.delete(k);
      });
      return;
    }
    this.values.delete(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    const listeners = this.listeners.get('message');
    if (listeners) {
      listeners.forEach((listener) => {
        listener(channel, message);
      });
    }
  }

  async subscribe(channel: string): Promise<void> {
    // Subscribe
    if (!subscribers.has(channel)) {
      subscribers.set(channel, new Set([this]));
    } else {
      const set = subscribers.get(channel) as Set<Redis>;
      set.add(this);
    }
  }

  async unsubscribe(channel: string): Promise<void> {
    // Unsubscribe
    if (subscribers.has(channel)) {
      const set = subscribers.get(channel) as Set<Redis>;
      if (set.has(this)) {
        set.delete(this);
      }
    }
  }

  duplicate(): this {
    // return new Redis(this.config);
    return this;
  }

  disconnect(): void {
    // Disconnects
  }

  async pubsub(command: string, channel: string): Promise<unknown[]> {
    if (command === 'NUMSUB') {
      return [channel, subscribers.get(channel)?.size ?? 0];
    }
    throw new Error('Invalid command.');
  }
}

export default Redis;

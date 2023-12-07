const values = new Map<string, string>();
const subscribers = new Map<string, Set<Redis>>();

class Redis {
  private callback?: (...args: any[]) => void;

  constructor(readonly config: any) {}

  on(event: string, callback: (...args: any[]) => void): void {
    if (event !== 'message') {
      throw new Error('ioredis mock only supports message events');
    }
    this.callback = callback;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | undefined> {
    return values.get(key);
  }

  async mget(...keys: string[]): Promise<(string | undefined)[]> {
    return keys.map((key) => values.get(key));
  }

  async set(key: string, value: string, ...args: (string | number)[]): Promise<undefined | null | string> {
    let oldValue;
    if (args.includes('GET')) {
      oldValue = values.get(key) ?? null; // `ioredis` returns `null` when key didn't previously exist
    }
    if (args.includes('NX') && values.has(key)) {
      return oldValue;
    }
    values.set(key, value);
    return oldValue;
  }

  async del(key: string | string[]): Promise<void> {
    if (Array.isArray(key)) {
      key.forEach((k) => {
        values.delete(k);
      });
      return;
    }
    values.delete(key);
  }

  async publish(channel: string, message: string): Promise<void> {
    const set = subscribers.get(channel);
    if (set) {
      set.forEach((subscriber) => {
        subscriber.callback?.(channel, message);
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

  duplicate(): Redis {
    return new Redis(this.config);
  }

  disconnect(): void {
    // Disconnects
    this.callback = undefined;
  }

  async pubsub(command: string, channel: string): Promise<unknown[]> {
    if (command === 'NUMSUB') {
      return [channel, subscribers.get(channel)?.size ?? 0];
    }
    throw new Error('Invalid command.');
  }
}

export default Redis;

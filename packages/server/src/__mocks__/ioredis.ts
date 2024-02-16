const values = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const subscribers = new Map<string, Set<Redis>>();

class ReplyError extends Error {}

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

  async get(key: string): Promise<string | null> {
    return values.get(key) ?? null;
  }

  async mget(...keys: string[] | string[][]): Promise<(string | null)[]> {
    let normalizedKeys: string[];
    if (keys.length === 1 && Array.isArray(keys[0])) {
      normalizedKeys = keys[0];
    } else {
      normalizedKeys = keys as string[];
    }
    return normalizedKeys.map((key) => values.get(key) ?? null);
  }

  async set(key: string, value: string, ...args: (string | number)[]): Promise<undefined | null | string> {
    let oldValue: undefined | null | string;
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

  async exists(key: string): Promise<boolean> {
    return values.has(key);
  }

  async sadd(setKey: string, ...members: string[]): Promise<number> {
    const existingValue = sets.get(setKey);
    let keySet: Set<string>;
    if (existingValue) {
      if (!(existingValue instanceof Set)) {
        throw new ReplyError('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      keySet = existingValue;
    } else {
      keySet = new Set<string>();
      sets.set(setKey, keySet);
    }
    let added = 0;
    for (const member of members) {
      if (keySet.has(member)) {
        continue;
      }
      keySet.add(member);
      added += 1;
    }
    return added;
  }

  async smembers(setKey: string): Promise<string[]> {
    const keySet = sets.get(setKey);
    if (!keySet) {
      return [];
    }
    if (!(keySet instanceof Set)) {
      throw new ReplyError('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return Array.from(keySet.keys());
  }

  async scard(setKey: string): Promise<number> {
    const set = sets.get(setKey);
    if (!set) {
      return 0;
    }
    return set.size;
  }
}

export default Redis;

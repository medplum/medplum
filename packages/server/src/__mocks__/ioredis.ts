class Redis {
  private values: Map<string, string>;
  constructor(readonly config: any) {
    this.values = new Map<string, string>();
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

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
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

  disconnect(): void {
    // Disconnects
  }
}

export default Redis;

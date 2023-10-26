/**
 * LRU cache (least recently used)
 * Source: https://stackoverflow.com/a/46432113
 */
export class LRUCache<T> {
  private readonly max: number;
  private readonly cache: Map<string, T>;

  constructor(max = 10) {
    this.max = max;
    this.cache = new Map();
  }

  /**
   * Deletes all values from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Returns the value for the given key.
   * @param key - The key to retrieve.
   * @returns The value if found; undefined otherwise.
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (item) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  /**
   * Sets the value for the given key.
   * @param key - The key to set.
   * @param val - The value to set.
   */
  set(key: string, val: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      this.cache.delete(this.first());
    }
    this.cache.set(key, val);
  }

  /**
   * Deletes the value for the given key.
   * @param key - The key to delete.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Returns the list of all keys in the cache.
   * @returns The array of keys in the cache.
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  private first(): string {
    // This works because the Map class maintains ordered keys.
    return this.cache.keys().next().value;
  }
}

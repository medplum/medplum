import { stringify } from './utils';

export interface IClientStorage {
  getInitPromise?(): Promise<void>;
  clear(): void;
  getString(key: string): string | undefined;
  setString(key: string, value: string | undefined): void;
  getObject<T>(key: string): T | undefined;
  setObject<T>(key: string, value: T): void;
}

/**
 * The ClientStorage class is a utility class for storing strings and objects.
 *
 * When using MedplumClient in the browser, it will be backed by browser localStorage.
 *
 * When Using MedplumClient in the server, it will be backed by the MemoryStorage class.  For example, the Medplum CLI uses `FileSystemStorage`.
 */
export class ClientStorage implements IClientStorage {
  private readonly storage: Storage;

  constructor(storage?: Storage) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : new MemoryStorage());
  }

  clear(): void {
    this.storage.clear();
  }

  getString(key: string): string | undefined {
    return this.storage.getItem(key) ?? undefined;
  }

  setString(key: string, value: string | undefined): void {
    if (value) {
      this.storage.setItem(key, value);
    } else {
      this.storage.removeItem(key);
    }
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? (JSON.parse(str) as T) : undefined;
  }

  setObject<T>(key: string, value: T): void {
    this.setString(key, value ? stringify(value) : undefined);
  }
}

/**
 * The MemoryStorage class is a minimal in-memory implementation of the Storage interface.
 */
export class MemoryStorage implements Storage {
  private data: Map<string, string>;

  constructor() {
    this.data = new Map<string, string>();
  }

  /**
   * Returns the number of key/value pairs.
   * @returns The number of key/value pairs.
   */
  get length(): number {
    return this.data.size;
  }

  /**
   * Removes all key/value pairs, if there are any.
   */
  clear(): void {
    this.data.clear();
  }

  /**
   * Returns the current value associated with the given key, or null if the given key does not exist.
   * @param key - The specified storage key.
   * @returns The current value associated with the given key, or null if the given key does not exist.
   */
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  /**
   * Sets the value of the pair identified by key to value, creating a new key/value pair if none existed for key previously.
   * @param key - The storage key.
   * @param value - The new value.
   */
  setItem(key: string, value: string | null): void {
    if (value) {
      this.data.set(key, value);
    } else {
      this.data.delete(key);
    }
  }

  /**
   * Removes the key/value pair with the given key, if a key/value pair with the given key exists.
   * @param key - The storage key.
   */
  removeItem(key: string): void {
    this.data.delete(key);
  }

  /**
   * Returns the name of the nth key, or null if n is greater than or equal to the number of key/value pairs.
   * @param index - The numeric index.
   * @returns The nth key.
   */
  key(index: number): string | null {
    return Array.from(this.data.keys())[index];
  }
}

/**
 * The MockAsyncClientStorage class is a mock implementation of the ClientStorage class.
 * This can be used for testing async initialization of the MedplumClient.
 */
export class MockAsyncClientStorage extends ClientStorage implements IClientStorage {
  private initialized: boolean;
  private initPromise: Promise<void>;
  private initResolve: () => void = () => undefined;

  constructor() {
    super();
    this.initialized = false;
    this.initPromise = new Promise((resolve) => {
      this.initResolve = resolve;
    });
  }

  setInitialized(): void {
    if (!this.initialized) {
      this.initResolve();
      this.initialized = true;
    }
  }

  getInitPromise(): Promise<void> {
    return this.initPromise;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

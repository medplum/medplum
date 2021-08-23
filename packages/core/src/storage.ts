import { stringify } from './utils';

export interface Storage {
  clear(): void;
  getString(key: string): string | undefined;
  setString(key: string, value: string | undefined): void;
  getObject<T>(key: string): T | undefined;
  setObject<T>(key: string, value: T): void;
}

export class MemoryStorage implements Storage {
  private data: Record<string, string>;

  constructor() {
    this.data = {};
  }

  clear(): void {
    this.data = {};
  }

  getString(key: string): string | undefined {
    return this.data[key];
  }

  setString(key: string, value: string | undefined): void {
    if (value) {
      this.data[key] = value;
    } else {
      delete this.data[key];
    }
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? JSON.parse(str) as T : undefined;
  }

  setObject<T>(key: string, value: T) {
    this.setString(key, value ? stringify(value) : undefined);
  }
}

export class LocalStorage implements Storage {

  clear(): void {
    localStorage.clear();
  }

  getString(key: string): string | undefined {
    return localStorage.getItem(key) || undefined;
  }

  setString(key: string, value: string | undefined): void {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? JSON.parse(str) as T : undefined;
  }

  setObject<T>(key: string, value: T) {
    this.setString(key, value ? stringify(value) : undefined);
  }
}
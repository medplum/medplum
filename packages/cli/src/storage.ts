import { ClientStorage } from '@medplum/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export class FileSystemStorage extends ClientStorage {
  private readonly dirName: string;
  private readonly fileName: string;

  constructor(profile: string) {
    super();
    this.dirName = resolve(homedir(), '.medplum');
    this.fileName = resolve(this.dirName, profile + '.json');
  }

  clear(): void {
    this.writeFile({});
  }

  getString(key: string): string | undefined {
    return this.readFile()?.[key];
  }

  setString(key: string, value: string | undefined): void {
    const data = this.readFile() ?? {};
    if (value) {
      data[key] = value;
    } else {
      delete data[key];
    }
    this.writeFile(data);
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? (JSON.parse(str) as T) : undefined;
  }

  setObject<T>(key: string, value: T): void {
    this.setString(key, value ? JSON.stringify(value) : undefined);
  }

  private readFile(): Record<string, string> | undefined {
    if (existsSync(this.fileName)) {
      return JSON.parse(readFileSync(this.fileName, 'utf8'));
    }
    return undefined;
  }

  private writeFile(data: Record<string, string>): void {
    if (!existsSync(this.dirName)) {
      mkdirSync(this.dirName);
    }
    writeFileSync(this.fileName, JSON.stringify(data, null, 2), 'utf8');
  }
}

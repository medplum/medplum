import { ClientStorage } from '@medplum/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';

export class FileSystemStorage extends ClientStorage {
  readonly #dirName: string;
  readonly #fileName: string;

  constructor() {
    super();
    this.#dirName = resolve(homedir(), '.medplum');
    this.#fileName = resolve(this.#dirName, 'credentials');
  }

  clear(): void {
    this.#writeFile({});
  }

  getString(key: string): string | undefined {
    return this.#readFile()?.[key];
  }

  setString(key: string, value: string | undefined): void {
    const data = this.#readFile() || {};
    if (value) {
      data[key] = value;
    } else {
      delete data[key];
    }
    this.#writeFile(data);
  }

  #readFile(): Record<string, string> | undefined {
    if (existsSync(this.#fileName)) {
      return JSON.parse(readFileSync(this.#fileName, 'utf8'));
    }
    return undefined;
  }

  #writeFile(data: Record<string, string>): void {
    if (!existsSync(this.#dirName)) {
      mkdirSync(this.#dirName);
    }
    writeFileSync(this.#fileName, JSON.stringify(data, null, 2), 'utf8');
  }
}

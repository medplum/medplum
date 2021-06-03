import { readFileSync } from 'fs';
import { resolve } from 'path';

export function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(__dirname, filename), 'utf8'));
}

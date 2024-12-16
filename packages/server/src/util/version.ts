import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let serverVersion: string | undefined;

export function getServerVersion(): string {
  if (!serverVersion) {
    serverVersion = (
      JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), { encoding: 'utf-8' })) as Record<string, any>
    ).version as string;
  }
  return serverVersion;
}

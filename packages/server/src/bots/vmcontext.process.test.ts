// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { runInVmContext } from './vmcontext';
import type { BotExecutionContext } from './types';

// Mock config to enable vmcontext bots
jest.mock('../config/loader', () => ({
  getConfig: () => ({
    vmContextBotsEnabled: true,
    vmContextBaseUrl: 'http://example.com',
    baseUrl: 'http://example.com',
  }),
}));

// Mock repository to satisfy binary fetch
jest.mock('../fhir/repo', () => ({
  getSystemRepo: () => ({
    readReference: async () => ({ resourceType: 'Binary' }),
  }),
}));

// Mock binary storage to return a placeholder stream
jest.mock('../storage/loader', () => ({
  getBinaryStorage: () => ({
    readBinary: async () => ({}),
  }),
}));

// Provide code string directly for the bot via mocked stream reader
jest.mock('../util/streams', () => ({
  readStreamToString: async () =>
    [
      "exports.handler = async () => {",
      "  if (typeof process !== 'object') throw new Error('no process');",
      "  const nextTickWorks = await new Promise((resolve) => process.nextTick(() => resolve(true)));",
      "  return {",
      "    node: process.versions?.node,",
      "    platform: process.platform,",
      "    arch: process.arch,",
      "    envSize: Object.keys(process.env ?? {}).length,",
      "    nextTickWorks,",
      "  };",
      "};",
    ].join('\n'),
}));

// Quiet the MockConsole output during test
jest.mock('../util/console', () => ({
  MockConsole: class {
    private logs: string[] = [];
    log = (...args: any[]): void => { this.logs.push(args.join(' ')); };
    toString = (): string => this.logs.join('\n');
  },
}));

describe('vmcontext process shim', () => {
  it('allows user code to access process and matches host values', async () => {
    const ctx: BotExecutionContext = {
      bot: { id: 'bot1', resourceType: 'Bot', executableCode: { url: 'Binary/1' } } as any,
      runAs: { id: 'pm1', resourceType: 'ProjectMembership' } as any,
      input: undefined,
      contentType: 'application/json',
      accessToken: 'token',
      secrets: {},
      traceId: 'trace-1',
      headers: {},
      defaultHeaders: {},
    };

    const result = await runInVmContext(ctx);
    expect(result.success).toBe(true);
    expect(result.returnValue).toBeDefined();
    const host = (globalThis as any).process;
    expect(result.returnValue.node).toBe(host?.versions?.node);
    expect(result.returnValue.platform).toBe(host?.platform);
    expect(result.returnValue.arch).toBe(host?.arch);
    expect(result.returnValue.envSize).toBe(0); // sandbox intentionally empties env
    expect(result.returnValue.nextTickWorks).toBe(true);
  });
});

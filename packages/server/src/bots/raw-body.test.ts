// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda';
import type { BotEvent } from '@medplum/core';
import * as core from '@medplum/core';
import { mockClient } from 'aws-sdk-client-mock';
import { transformSync } from 'esbuild';
import JSZip from 'jszip';
import { Readable } from 'node:stream';
import vm from 'node:vm';
import { vi } from 'vitest';
import { deployLambda } from '../cloud/aws/deploy';
import { deployLambdaStreaming } from '../cloud/aws/deploystreaming';
import { buildLambdaPayload } from '../cloud/aws/execute';
import { executeFissionBot } from '../cloud/fission/execute';
import * as fissionUtils from '../cloud/fission/utils';
import { FISSION_INDEX_CODE } from '../cloud/fission/wrapper';
import { getConfig, loadTestConfig } from '../config/loader';
import * as repo from '../fhir/repo';
import * as storage from '../storage/loader';
import type { BotExecutionContext } from './types';
import { runInVmContext } from './vmcontext';

const rawBody = '{ "greeting": "café 🌍", "escaped": "\\u0061", "number": 1.00 }\n';
const userCode = 'exports.handler = async (_medplum, event) => ({ input: event.input });';

function createContext(input: unknown): BotExecutionContext {
  return {
    bot: { resourceType: 'Bot', id: 'test-bot', executableCode: { url: 'Binary/test-code' } },
    runAs: {
      resourceType: 'ProjectMembership',
      id: 'test-membership',
      user: { reference: 'User/test-user' },
      project: { reference: 'Project/test-project' },
      profile: { reference: 'Bot/test-bot' },
    },
    accessToken: 'test-token',
    input,
    contentType: core.ContentType.JSON,
    secrets: {},
  };
}

function createSandbox(): Record<string, any> {
  const exports = {};
  return {
    exports,
    module: { exports },
    awslambda: { streamifyResponse: (handler: unknown) => handler },
    console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
    require: (name: string) => {
      if (name === '@medplum/core') {
        return core;
      }
      if (name.startsWith('./user.')) {
        return { handler: (_medplum: unknown, event: BotEvent) => ({ input: event.input }) };
      }
      if (name === 'pdfmake') {
        return {};
      }
      throw new Error('Unexpected dependency: ' + name);
    },
  };
}

beforeAll(async () => {
  await loadTestConfig();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test.each([rawBody, JSON.parse(rawBody)])('Forwards raw or parsed input through VM: %s', async (body) => {
  getConfig().vmContextBotsEnabled = true;
  vi.spyOn(repo, 'getProjectSystemRepo').mockResolvedValue({
    readReference: vi.fn().mockResolvedValue({ resourceType: 'Binary', id: 'test-code' }),
  } as unknown as repo.SystemRepository);
  vi.spyOn(storage, 'getBinaryStorage').mockReturnValue({
    readBinary: vi.fn().mockResolvedValue(Readable.from([Buffer.from(userCode)])),
  } as unknown as ReturnType<typeof storage.getBinaryStorage>);

  const result = await runInVmContext(createContext(body));
  expect(result.success).toBe(true);
  expect(result.returnValue).toEqual({ input: body });
});

test.each([
  ['standard', 'cjs'],
  ['standard', 'esm'],
  ['streaming', 'cjs'],
  ['streaming', 'esm'],
])('Forwards raw or parsed input through deployed %s Lambda %s wrapper', async (runtime, format) => {
  const client = mockClient(LambdaClient);
  try {
    client.on(GetFunctionCommand).resolves({});
    client.on(ListLayerVersionsCommand).resolves({ LayerVersions: [{ LayerVersionArn: 'test-layer' }] });
    client.on(CreateFunctionCommand).resolves({});
    const context = createContext(rawBody);
    const deploy = runtime === 'streaming' ? deployLambdaStreaming : deployLambda;
    await deploy(
      context.bot,
      format === 'esm' ? userCode.replace('exports.handler =', 'export const handler =') : userCode
    );
    const zipBytes = client.commandCalls(CreateFunctionCommand)[0].args[0].input.Code?.ZipFile;
    const zip = await JSZip.loadAsync(zipBytes as Uint8Array);
    const code = await zip.file(format === 'esm' ? 'index.mjs' : 'index.cjs')?.async('string');
    expect(code).toBeDefined();
    const sandbox = createSandbox();
    vm.runInNewContext(
      format === 'esm' ? transformSync(code as string, { format: 'cjs' }).code : (code as string),
      sandbox
    );

    for (const body of [rawBody, JSON.parse(rawBody)]) {
      const payload = JSON.parse(JSON.stringify(buildLambdaPayload(createContext(body))));
      expect(payload).not.toHaveProperty('rawBody');
      const chunks: string[] = [];
      const responseStream = { write: (chunk: string) => chunks.push(chunk), end() {} };
      const handler = sandbox.module.exports.handler;
      let result;
      if (runtime === 'streaming') {
        await handler({ ...payload, streaming: true }, responseStream);
        result = JSON.parse(chunks.slice(1).join(''));
      } else {
        result = await handler(payload);
      }
      expect(result.input).toEqual(body);
    }
  } finally {
    client.restore();
  }
});

test.each([rawBody, JSON.parse(rawBody)])(
  'Forwards raw or parsed input through Fission transport and wrapper: %s',
  async (body) => {
    const sandbox = createSandbox();
    vm.runInNewContext(FISSION_INDEX_CODE, sandbox);
    vi.spyOn(fissionUtils, 'executeFissionFunction').mockImplementation(async (_id, payload) => {
      const event = JSON.parse(payload);
      expect(event).not.toHaveProperty('rawBody');
      const response = await sandbox.module.exports({ request: { body: event } });
      return { ok: true, status: response.status, body: response.body };
    });
    const result = await executeFissionBot(createContext(body));
    expect(result.success).toBe(true);
    expect(result.returnValue.input).toEqual(body);
  }
);

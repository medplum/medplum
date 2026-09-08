// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogLevel, allOk, createReference } from '@medplum/core';
import type { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dimse from 'dcmjs-dimse';
import { Server } from 'mock-socket';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { App } from './app';
import type { AgentDicomChannel } from './dicom';

const medplum = new MockClient();
const sampleFile = path.resolve(__dirname, '../testdata/sample-sr.dcm');
let bot: Bot;

describe('DICOM', () => {
  beforeAll(async () => {
    console.log = vi.fn();
    dimse.log.disableAll(false);

    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => {
      return [allOk, {} as Resource];
    });

    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
  });

  afterEach(() => {
    // The `medplum` client is shared by every test in this file, so a spy left installed on it
    // leaks into the next test's resource setup.
    vi.restoreAllMocks();
  });

  test('C-ECHO and C-STORE', async () => {
    const harness = await startAgent('dicom://0.0.0.0:8104');

    const client = new dimse.Client();

    //
    // C-ECHO
    //
    const echoResponse = await new Promise<dimse.responses.CEchoResponse>((resolve, reject) => {
      const request = new dimse.requests.CEchoRequest();
      request.on('response', resolve);
      client.on('networkError', reject);
      client.addRequest(request);
      client.send('localhost', 8104, 'SCU', 'ANY-SCP');
    });

    expect(echoResponse).toBeDefined();

    const echoCommandDataset = echoResponse.getCommandDataset();
    expect(echoCommandDataset).toBeDefined();
    expect(echoCommandDataset?.getTransferSyntaxUid()).toBe('1.2.840.10008.1.2');
    expect(echoCommandDataset?.getElement('Status')).toStrictEqual(0);

    //
    // C-STORE
    //

    // Use a fresh client (and therefore a fresh association) for the C-STORE.
    // Reusing the C-ECHO client races the new request against the prior
    // association's socket teardown, which intermittently surfaces as a
    // "write after end" networkError or a ProcessingFailure (0x0110) status.
    const storeResponse = await cStore(8104);
    expectStoreSuccess(storeResponse);

    // Default storage mode uploads the instance as a FHIR Binary and hands the Bot a reference
    const payload = await harness.payload;
    expect(payload.binary?.reference).toMatch(/^Binary\//);
    expect(payload.dataset).toBeDefined();

    client.clearRequests();
    await harness.stop();
  }, 10000);

  test('C-STORE using DICOMweb storage', async () => {
    const stowRequests: string[] = [];
    const realPost = medplum.post.bind(medplum);
    // Scoped to the STOW-RS URL: `createResource` also goes through `post`, so a blanket mock
    // would break any resource created while it is installed.
    vi.spyOn(medplum, 'post').mockImplementation(async (url, body, contentType, options) => {
      if (url.toString().includes('/dicomweb/studies')) {
        stowRequests.push(contentType as string);
        return readStream(body as Readable);
      }
      return realPost(url, body, contentType, options);
    });

    const harness = await startAgent('dicom://0.0.0.0:8105?storage=dicomweb');
    expect(harness.channelStorageMode()).toBe('dicomweb');

    const storeResponse = await cStore(8105);
    expectStoreSuccess(storeResponse);

    // The instance went to STOW-RS as a multipart/related body, not to a Binary
    expect(stowRequests).toHaveLength(1);
    expect(stowRequests[0]).toMatch(/^multipart\/related; type=application\/dicom; boundary=medplum-\d+$/);

    const payload = await harness.payload;
    expect(payload.binary).toBeUndefined();
    expect(payload.dataset).toBeDefined();

    await harness.stop();
  }, 10000);

  test('rejects invalid DICOM storage mode', async () => {
    const postSpy = vi.spyOn(medplum, 'post');

    const harness = await startAgent('dicom://0.0.0.0:8106?storage=invalid');

    // An unrecognized mode warns and falls back to `binary`, so a typo cannot silently point a
    // channel at a DICOMweb endpoint the server may not have
    expect(harness.channelStorageMode()).toBe('binary');

    const storeResponse = await cStore(8106);
    expectStoreSuccess(storeResponse);

    const payload = await harness.payload;
    expect(payload.binary?.reference).toMatch(/^Binary\//);
    expect(postSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/dicomweb'),
      expect.anything(),
      expect.anything()
    );

    await harness.stop();
  }, 10000);
});

type TestHarness = {
  app: App;
  /** Resolves with the `dataset`/`binary` payload from the first `agent:transmit:request`. */
  payload: Promise<Record<string, any>>;
  channelStorageMode: () => string;
  stop: () => Promise<void>;
};

async function startAgent(address: string): Promise<TestHarness> {
  const mockServer = new Server('wss://example.com/ws/agent');

  let resolvePayload: (payload: Record<string, any>) => void;
  const payload = new Promise<Record<string, any>>((resolve) => {
    resolvePayload = resolve;
  });

  mockServer.on('connection', (socket) => {
    socket.on('message', (data) => {
      const command = JSON.parse((data as Buffer).toString('utf8'));
      if (command.type === 'agent:connect:request') {
        socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
      } else if (command.type === 'agent:transmit:request') {
        resolvePayload(JSON.parse(command.body));
      }
    });
  });

  const endpoint = await medplum.createResource({ resourceType: 'Endpoint', address } as Endpoint);
  const channelName = `test-${new URL(address).port}`;
  const agent = await medplum.createResource({
    resourceType: 'Agent',
    channel: [
      {
        name: channelName,
        endpoint: createReference(endpoint),
        targetReference: createReference(bot),
      },
    ],
  } as Agent);

  const app = new App(medplum, agent.id, LogLevel.INFO);
  await app.start();

  return {
    app,
    payload,
    channelStorageMode: () => (app.channels.get(channelName) as AgentDicomChannel).getStorageMode(),
    stop: async () => {
      await app.stop();
      mockServer.stop();
    },
  };
}

async function cStore(port: number): Promise<dimse.responses.CStoreResponse> {
  const client = new dimse.Client();
  try {
    return await new Promise<dimse.responses.CStoreResponse>((resolve, reject) => {
      const request = new dimse.requests.CStoreRequest(sampleFile);
      request.on('response', resolve);
      client.on('networkError', reject);
      client.addRequest(request);
      client.send('localhost', port, 'SCU', 'ANY-SCP');
    });
  } finally {
    client.clearRequests();
  }
}

function expectStoreSuccess(storeResponse: dimse.responses.CStoreResponse): void {
  expect(storeResponse).toBeDefined();
  const commandDataset = storeResponse.getCommandDataset();
  expect(commandDataset).toBeDefined();
  expect(commandDataset?.getTransferSyntaxUid()).toBe('1.2.840.10008.1.2');
  expect(commandDataset?.getElement('Status')).toStrictEqual(0);
}

/**
 * Drains a streamed request body, as a real HTTP request would.
 *
 * The STOW-RS body is written to a `PassThrough` while the request is in flight, so a mock that
 * never reads it would stall the writer once the stream's high water mark is reached.
 * @param stream - The request body stream.
 * @returns A stand-in STOW-RS response body.
 */
async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
  return 'ok';
}

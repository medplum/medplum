import { allOk, ContentType, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Agent, Bundle, Parameters, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'node:crypto';
import { main } from '.';
import { createMedplumClient } from './util/client';

const EXAMPLE_HL7_MSG = `MSH|^~\\&|SENDING_APPLICATION|SENDING_FACILITY|RECEIVING_APPLICATION|RECEIVING_FACILITY|20240927120000||ADT^A01|MSG00001|P|2.3
EVN|A01|20240927120000
PID|1||123456789^^^HOSPITAL^MR||Doe^John^^^^||19800101|M`;

jest.mock('./util/client');
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));

describe('Agent CLI', () => {
  const env = process.env;
  let processError: jest.SpyInstance;
  let consoleTableSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let medplum: MockClient;
  let medplumGetSpy: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
    consoleTableSpy = jest.spyOn(console, 'table').mockImplementation(jest.fn());
    console.info = jest.fn();
    consoleInfoSpy = jest.spyOn(console, 'info');

    indexSearchParameterBundle(readJson('fhir/r4/profiles-types.json') as Bundle<SearchParameter>);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    medplum = new MockClient();
    medplumGetSpy = jest.spyOn(medplum, 'get');

    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    process.env = env;
  });

  describe('Agent `status` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'status'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('Error: Either an [agentId...] arg or a --criteria <criteria> flag is required')
      );
    });

    describe('By ID', () => {
      test('Happy path', async () => {
        const agentId = randomUUID();
        await medplum.createResource({ id: agentId, resourceType: 'Agent', name: 'Test Agent 1', status: 'active' });
        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
          return [
            allOk,
            {
              resourceType: 'Parameters',
              parameter: [
                { name: 'status', valueString: 'unknown' },
                { name: 'version', valueString: 'unknown' },
              ],
            } satisfies Parameters,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'status', agentId])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenNthCalledWith(
          2,
          medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith('1 successful response(s):');
        expect(consoleTableSpy).toHaveBeenCalledTimes(1);
        expect(consoleTableSpy).toHaveBeenCalledWith([
          expect.objectContaining({
            id: agentId,
            name: 'Test Agent 1',
            enabledStatus: 'active',
            version: 'unknown',
            connectionStatus: 'unknown',
            statusLastUpdated: 'N/A',
          }),
        ]);
      });

      test('JSON output', async () => {
        const agentId = randomUUID();
        const lastUpdated = new Date().toISOString();

        await medplum.createResource({ id: agentId, resourceType: 'Agent', name: 'Test Agent 1', status: 'active' });
        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
          return [
            allOk,
            {
              resourceType: 'Parameters',
              parameter: [
                { name: 'status', valueString: 'connected' },
                { name: 'version', valueString: '3.2.15' },
                { name: lastUpdated, valueInstant: lastUpdated },
              ],
            } satisfies Parameters,
          ];
        });

        await expect(
          main(['node', 'index.js', 'agent', 'status', agentId, '--output', 'json'])
        ).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenNthCalledWith(
          1,
          medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          JSON.stringify(
            {
              resourceType: 'Parameters',
              parameter: [
                { name: 'status', valueString: 'connected' },
                { name: 'version', valueString: '3.2.15' },
                { name: lastUpdated, valueInstant: lastUpdated },
              ],
            } satisfies Parameters,
            null,
            2
          )
        );
        expect(console.table).not.toHaveBeenCalled();
      });

      test('lastUpdated available', async () => {
        const agentId = randomUUID();
        const lastUpdated = new Date().toISOString();
        await medplum.createResource({ id: agentId, resourceType: 'Agent', name: 'Test Agent 1', status: 'active' });
        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
          return [
            allOk,
            {
              resourceType: 'Parameters',
              parameter: [
                { name: 'status', valueString: 'connected' },
                { name: 'version', valueString: '3.2.15' },
                { name: 'lastUpdated', valueInstant: lastUpdated },
              ],
            } satisfies Parameters,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'status', agentId])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenNthCalledWith(
          2,
          medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith('1 successful response(s):');
        expect(consoleTableSpy).toHaveBeenCalledTimes(1);
        expect(consoleTableSpy).toHaveBeenCalledWith([
          expect.objectContaining({
            id: agentId,
            name: 'Test Agent 1',
            enabledStatus: 'active',
            version: '3.2.15',
            connectionStatus: 'connected',
            statusLastUpdated: lastUpdated,
          }),
        ]);
      });
    });

    describe('List of agent IDs', () => {
      test('Happy path', async () => {
        const agentIds = [randomUUID(), randomUUID(), randomUUID()];
        const agents: Agent[] = await Promise.all(
          agentIds.map(async (id, i) =>
            medplum.createResource({
              id,
              resourceType: 'Agent',
              name: `Test Agent ${i + 1}`,
              status: 'active',
            })
          )
        );

        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
          return [
            allOk,
            {
              resourceType: 'Bundle',
              type: 'collection',
              entry: agents.map((agent) => ({
                resource: {
                  resourceType: 'Parameters',
                  parameter: [
                    { name: 'agent', resource: agent },
                    {
                      name: 'result',
                      resource: {
                        resourceType: 'Parameters',
                        parameter: [
                          { name: 'status', valueString: 'unknown' },
                          { name: 'version', valueString: 'unknown' },
                        ],
                      } satisfies Parameters,
                    },
                  ],
                },
              })),
            } satisfies Bundle,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'status', ...agentIds])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenNthCalledWith(
          1,
          medplum.fhirUrl(`Agent/$bulk-status?_id=${agentIds.join(',')}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith('3 successful response(s):');
        expect(consoleTableSpy).toHaveBeenCalledTimes(1);
        expect(consoleTableSpy).toHaveBeenCalledWith(
          agents.map(({ id, name }) => ({
            id,
            name,
            enabledStatus: 'active',
            version: 'unknown',
            connectionStatus: 'unknown',
            statusLastUpdated: 'N/A',
          }))
        );
      });
    });

    describe('By criteria', () => {
      test('Happy path', async () => {
        const agentIds = [randomUUID(), randomUUID(), randomUUID()];
        const agents: Agent[] = await Promise.all(
          agentIds.map(async (id, i) =>
            medplum.createResource({
              id,
              resourceType: 'Agent',
              name: `Test Agent ${i + 1}`,
              status: 'active',
            })
          )
        );

        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
          return [
            allOk,
            {
              resourceType: 'Bundle',
              type: 'collection',
              entry: agents.map((agent) => ({
                resource: {
                  resourceType: 'Parameters',
                  parameter: [
                    { name: 'agent', resource: agent },
                    {
                      name: 'result',
                      resource: {
                        resourceType: 'Parameters',
                        parameter: [
                          { name: 'status', valueString: 'unknown' },
                          { name: 'version', valueString: 'unknown' },
                        ],
                      } satisfies Parameters,
                    },
                  ],
                },
              })),
            } satisfies Bundle,
          ];
        });

        await expect(
          main(['node', 'index.js', 'agent', 'status', '--criteria', 'Agent?name=Test Agent'])
        ).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenNthCalledWith(
          1,
          medplum.fhirUrl('Agent/$bulk-status?name=Test+Agent'),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith('3 successful response(s):');
        expect(consoleTableSpy).toHaveBeenCalledTimes(1);
        expect(consoleTableSpy).toHaveBeenCalledWith(
          agents.map(({ id, name }) => ({
            id,
            name,
            enabledStatus: 'active',
            version: 'unknown',
            connectionStatus: 'unknown',
            statusLastUpdated: 'N/A',
          }))
        );
      });
    });
  });

  describe('Agent `ping` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'ping'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("error: missing required argument 'ipOrDomain'")
      );
    });

    test('No agent ID or criteria', async () => {
      await expect(main(['node', 'index.js', 'agent', 'ping', '8.8.8.8'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('requires either an [agentId] or a --criteria <criteria> flag')
      );
    });

    describe('By ID', () => {
      test('Basic ping', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', agentId])).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 1',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Multiple pings', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', agentId, '--count', '4'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 4',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Invalid input: Included both agentId and criteria', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', agentId, '--criteria', 'Agent?name=Test Agent'])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(medplumPushSpy).not.toHaveBeenCalled();
        expect(processError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Error: Ambiguous arguments and options combination; [agentId] arg and --criteria <criteria> flag are mutually exclusive'
          )
        );
      });
    });

    describe('By criteria', () => {
      test('Basic ping', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');

        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 1',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Multiple pings', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent', '--count', '4'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 4',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Invalid input: ambiguous criteria (resolves to more than one agent)', async () => {
        const agentId1 = randomUUID();
        const agentId2 = randomUUID();
        await medplum.createResource({
          id: agentId1,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        await medplum.createResource({
          id: agentId2,
          resourceType: 'Agent',
          name: 'Test Agent 2',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent'])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(medplumPushSpy).not.toHaveBeenCalled();
        expect(processError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Error: Found more than one agent matching this criteria. This operation requires the criteria to resolve to exactly one agent'
          )
        );

        medplumPushSpy.mockClear();
        processError.mockClear();

        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent 1'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId1}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 1',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });

    test('Invalid response from agent', async () => {
      const agentId = randomUUID();
      await medplum.createResource({
        id: agentId,
        resourceType: 'Agent',
        name: 'Test Agent 1',
        status: 'active',
      } satisfies Agent);
      const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent').mockImplementation(() => {
        throw new Error('Invalid response!');
      });
      await expect(
        main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent', '--count', '4'])
      ).rejects.toThrow('Process exited with exit code 1');
      expect(medplumPushSpy).toHaveBeenCalledWith(
        { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
        '8.8.8.8',
        'PING 4',
        ContentType.PING,
        true,
        expect.objectContaining({ maxRetries: 0 })
      );
      expect(processError).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected response from agent while pinging')
      );
    });
  });

  describe('Agent `push` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'push'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("error: missing required argument 'deviceId'")
      );
    });

    test('No message or agent', async () => {
      const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });
      await expect(main(['node', 'index.js', 'agent', 'push', device.id as string])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("error: missing required argument 'message'")
      );
    });

    test('No agent selected', async () => {
      const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });
      await expect(main(['node', 'index.js', 'agent', 'push', device.id as string, EXAMPLE_HL7_MSG])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          'Error: The `ping` command requires either an [agentId] or a --criteria <criteria> flag'
        )
      );
    });

    describe('By ID', () => {
      test('Basic push', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'push', device.id as string, EXAMPLE_HL7_MSG, agentId])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          EXAMPLE_HL7_MSG,
          ContentType.HL7_V2,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Setting content type', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main([
            'node',
            'index.js',
            'agent',
            'push',
            device.id as string,
            'Hello, Medplum!',
            agentId,
            '--content-type',
            ContentType.TEXT,
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          'Hello, Medplum!',
          ContentType.TEXT,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Multiple args', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main([
            'node',
            'index.js',
            'agent',
            'push',
            device.id as string,
            'Hello, Medplum!',
            agentId,
            '--no-wait',
            '--content-type',
            ContentType.TEXT,
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          'Hello, Medplum!',
          ContentType.TEXT,
          false,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('No waiting for response', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main(['node', 'index.js', 'agent', 'push', device.id as string, EXAMPLE_HL7_MSG, agentId, '--no-wait'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          EXAMPLE_HL7_MSG,
          ContentType.HL7_V2,
          false,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Invalid response from agent', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent').mockImplementation(() => {
          throw new Error('Invalid response!');
        });
        await expect(
          main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent', '--count', '4'])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          '8.8.8.8',
          'PING 4',
          ContentType.PING,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).toHaveBeenCalledWith(
          expect.stringContaining('Unexpected response from agent while pinging')
        );
      });
    });

    describe('By criteria', () => {
      test('Basic push', async () => {
        const agentId = randomUUID();
        await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main([
            'node',
            'index.js',
            'agent',
            'push',
            device.id as string,
            EXAMPLE_HL7_MSG,
            '--criteria',
            'Agent?name=Test Agent',
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          EXAMPLE_HL7_MSG,
          ContentType.HL7_V2,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Invalid input: criteria resolves to more than one agent', async () => {
        const agentId1 = randomUUID();
        await medplum.createResource({
          id: agentId1,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);
        const agentId2 = randomUUID();
        await medplum.createResource({
          id: agentId2,
          resourceType: 'Agent',
          name: 'Test Agent 2',
          status: 'active',
        } satisfies Agent);
        const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

        const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent');
        await expect(
          main([
            'node',
            'index.js',
            'agent',
            'push',
            device.id as string,
            EXAMPLE_HL7_MSG,
            '--criteria',
            'Agent?name=Test Agent',
          ])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(medplumPushSpy).not.toHaveBeenCalled();
        expect(processError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Found more than one agent matching this criteria. This operation requires the criteria to resolve to exactly one agent'
          )
        );

        medplumPushSpy.mockClear();
        processError.mockClear();

        await expect(
          main([
            'node',
            'index.js',
            'agent',
            'push',
            device.id as string,
            EXAMPLE_HL7_MSG,
            '--criteria',
            'Agent?name=Test Agent 1',
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId1}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id as string}` },
          EXAMPLE_HL7_MSG,
          ContentType.HL7_V2,
          true,
          expect.objectContaining({ maxRetries: 0 })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });

    test('Invalid response from agent', async () => {
      const agentId = randomUUID();
      await medplum.createResource({
        id: agentId,
        resourceType: 'Agent',
        name: 'Test Agent 1',
        status: 'active',
      } satisfies Agent);
      const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });

      const medplumPushSpy = jest.spyOn(medplum, 'pushToAgent').mockImplementation(() => {
        throw new Error('Invalid response!');
      });
      await expect(
        main(['node', 'index.js', 'agent', 'push', device.id as string, EXAMPLE_HL7_MSG, agentId])
      ).rejects.toThrow('Process exited with exit code 1');
      expect(medplumPushSpy).toHaveBeenCalledWith(
        { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
        { reference: `Device/${device.id as string}` },
        EXAMPLE_HL7_MSG,
        ContentType.HL7_V2,
        true,
        expect.objectContaining({ maxRetries: 0 })
      );
      expect(processError).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected response from agent while pushing message to agent')
      );
    });
  });

  describe('Agent `reload-config` command', () => {
    describe('By ID', () => {
      test('One agent reloaded by ID', async () => {
        const agentId = randomUUID();
        const agent = await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);

        medplum.router.router.add('GET', 'Agent/$reload-config', async () => {
          return [
            allOk,
            {
              resourceType: 'Bundle',
              type: 'collection',
              entry: [
                {
                  resource: {
                    resourceType: 'Parameters',
                    parameter: [
                      { name: 'agent', resource: agent },
                      {
                        name: 'result',
                        resource: allOk,
                      },
                    ],
                  },
                },
              ],
            } satisfies Bundle,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'reload-config', agentId])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          medplum.fhirUrl('Agent', `$reload-config?_id=${agentId}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Multiple agents reloaded by ID', async () => {
        const agentIds = [randomUUID(), randomUUID(), randomUUID()];
        const agents: Agent[] = await Promise.all(
          agentIds.map((id, i) =>
            medplum.createResource({
              id,
              resourceType: 'Agent',
              name: `Test Agent ${i + 1}`,
              status: 'active',
            })
          )
        );

        medplum.router.router.add('GET', 'Agent/$reload-config', async () => {
          return [
            allOk,
            {
              resourceType: 'Bundle',
              type: 'collection',
              entry: agents.map((agent) => ({
                resource: {
                  resourceType: 'Parameters',
                  parameter: [
                    { name: 'agent', resource: agent },
                    {
                      name: 'result',
                      resource: allOk,
                    },
                  ],
                },
              })),
            } satisfies Bundle,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'reload-config', ...agentIds])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          medplum.fhirUrl('Agent', `$reload-config?_id=${agentIds.join(',')}`),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });
  });
});

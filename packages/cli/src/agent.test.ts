// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  ContentType,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
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
  let consoleErrorSpy: jest.SpyInstance;
  let medplum: MockClient;
  let medplumGetSpy: jest.SpyInstance;

  beforeAll(() => {
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());
    consoleTableSpy = jest.spyOn(console, 'table').mockImplementation(jest.fn());
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(jest.fn());

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
    medplum = new MockClient();
    (createMedplumClient as unknown as jest.Mock).mockImplementation(async () => medplum);

    process.env = { ...env };
    medplumGetSpy = jest.spyOn(medplum, 'get');
  });

  afterAll(() => {
    process.env = env;
  });

  describe('Agent `status` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'status'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenCalledWith(
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
        expect(medplumGetSpy).toHaveBeenCalledWith(
          // NOTE(ThatOneBro 28 Sept 2024):
          // We have to use this pattern due to a bug in the Jest matcher, specifically on MacOS
          // For the case of URL objects passed into `.toHaveBeenCalledWith` as an arg,
          // Any URL object that the function was called with will match any URL object passed into the matcher
          // This caused many tests to pass when they shouldn't have, luckily CI runs Linux and caught the broken tests
          // This issue should be fixed in Jest 30, which is currently in alpha
          // See: https://github.com/jestjs/jest/issues/15032
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('1 successful response(s):'));
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
        expect(medplumGetSpy).toHaveBeenCalledWith(
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
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('1 successful response(s):'));
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

      test('Status failed for one of the agents', async () => {
        const agentId = randomUUID();
        const agent = await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        });
        medplum.router.router.add('GET', 'Agent/$bulk-status', async () => {
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
                        resource: badRequest('Something bad happened'),
                      },
                    ],
                  },
                },
              ],
            } satisfies Bundle,
          ];
        });

        await expect(main(['node', 'index.js', 'agent', 'status', agentId])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$bulk-status?_id=${agentId}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith('1 failed response(s):');
        expect(consoleTableSpy).toHaveBeenCalledWith([
          expect.objectContaining({
            id: agentId,
            name: 'Test Agent 1',
            severity: 'error',
            code: 'invalid',
            details: 'Something bad happened',
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
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$bulk-status?_id=${encodeURIComponent(agentIds.join(','))}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('3 successful response(s):'));
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
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', '$bulk-status?name=Test+Agent').href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('3 successful response(s):'));
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

      test('Invalid criteria', async () => {
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

        const INVALID_CRITERIA = [
          'name=Test Agent',
          'DiagnosticReport?name=Test Agent',
          'Agent?',
          'Agent',
          'Agent?broken',
          Symbol('AGENT'), // Not really possible in user land but using this to get coverage on the constructor throwing for `URLSearchParams`
        ];
        for (const criteria of INVALID_CRITERIA) {
          // @ts-expect-error Broken because of the symbol value at the end of the array
          await expect(main(['node', 'index.js', 'agent', 'status', '--criteria', criteria])).rejects.toThrow(
            'Process exited with exit code 1'
          );
          expect(medplumGetSpy).not.toHaveBeenCalled();
          expect(processError).toHaveBeenCalledWith(
            expect.stringContaining(
              "Error: Criteria must be formatted as a string containing the resource type (Agent) followed by a '?' and valid URL search query params, eg. `Agent?name=Test Agent`"
            )
          );
        }
      });
    });
  });

  describe('Agent `ping` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'ping'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenCalledWith(
        expect.stringContaining("error: missing required argument 'ipOrDomain'")
      );
    });

    test('No agent ID or criteria', async () => {
      await expect(main(['node', 'index.js', 'agent', 'ping', '8.8.8.8'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(
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

    test('Invalid response from agent -- verbose mode enabled', async () => {
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
        main(['node', 'index.js', 'agent', 'ping', '8.8.8.8', '--criteria', 'Agent?name=Test Agent', '--verbose'])
      ).rejects.toThrow('Process exited with exit code 1');
      expect(medplumPushSpy).toHaveBeenCalledWith(
        { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
        '8.8.8.8',
        'PING 1',
        ContentType.PING,
        true,
        expect.objectContaining({ maxRetries: 0 })
      );
      expect(processError).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Unexpected response from agent while pinging'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('Invalid response!'));
    });
  });

  describe('Agent `push` command', () => {
    test('No command args', async () => {
      await expect(main(['node', 'index.js', 'agent', 'push'])).rejects.toThrow('Process exited with exit code 1');
      expect(processError).toHaveBeenCalledWith(expect.stringContaining("error: missing required argument 'deviceId'"));
    });

    test('No message or agent', async () => {
      const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });
      await expect(main(['node', 'index.js', 'agent', 'push', device.id])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining("error: missing required argument 'message'"));
    });

    test('No agent selected', async () => {
      const device = await medplum.createResource({ id: randomUUID(), resourceType: 'Device' });
      await expect(main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(
        expect.stringContaining('Error: This command requires either an [agentId] or a --criteria <criteria> flag')
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
          main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG, agentId])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
            device.id,
            'Hello, Medplum!',
            agentId,
            '--content-type',
            ContentType.TEXT,
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
            device.id,
            'Hello, Medplum!',
            agentId,
            '--no-wait',
            '--content-type',
            ContentType.TEXT,
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
          main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG, agentId, '--no-wait'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
          main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG, '--criteria', 'Agent?name=Test Agent'])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
          main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG, '--criteria', 'Agent?name=Test Agent'])
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
            device.id,
            EXAMPLE_HL7_MSG,
            '--criteria',
            'Agent?name=Test Agent 1',
          ])
        ).resolves.toBeUndefined();
        expect(medplumPushSpy).toHaveBeenCalledWith(
          { reference: `Agent/${agentId1}` } satisfies Reference<Agent>,
          { reference: `Device/${device.id}` },
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
      await expect(main(['node', 'index.js', 'agent', 'push', device.id, EXAMPLE_HL7_MSG, agentId])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(medplumPushSpy).toHaveBeenCalledWith(
        { reference: `Agent/${agentId}` } satisfies Reference<Agent>,
        { reference: `Device/${device.id}` },
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
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$reload-config?_id=${agentId}`).href,
          }),
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
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$reload-config?_id=${encodeURIComponent(agentIds.join(','))}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Both IDs and criteria present', async () => {
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

        await expect(
          main(['node', 'index.js', 'agent', 'reload-config', ...agentIds, '--criteria', 'Agent?name=Test Agent'])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(medplumGetSpy).not.toHaveBeenCalled();
        expect(processError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Error: Ambiguous arguments and options combination; [agentIds...] arg and --criteria <criteria> flag are mutually exclusive'
          )
        );
      });

      test('Invalid ID in agent list', async () => {
        const agentIds = [randomUUID(), 'asdad', randomUUID()];
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

        await expect(main(['node', 'index.js', 'agent', 'reload-config', ...agentIds])).rejects.toThrow(
          'Process exited with exit code 1'
        );
        expect(medplumGetSpy).not.toHaveBeenCalled();
        expect(processError).toHaveBeenCalledWith(expect.stringContaining("Input 'asdad' is not a valid agentId"));
      });
    });

    describe('By criteria', () => {
      test('Basic case', async () => {
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

        await expect(
          main(['node', 'index.js', 'agent', 'reload-config', '--criteria', 'Agent?name=Test Agent'])
        ).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({ href: medplum.fhirUrl('Agent', '$reload-config?name=Test+Agent').href }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });
  });

  describe('Agent `upgrade` command', () => {
    describe('By ID', () => {
      test('One agent upgraded by ID', async () => {
        const agentId = randomUUID();
        const agent = await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);

        medplum.router.router.add('GET', 'Agent/$upgrade', async () => {
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

        await expect(main(['node', 'index.js', 'agent', 'upgrade', agentId])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({ href: medplum.fhirUrl('Agent', `$upgrade?_id=${agentId}`).href }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });

      test('Multiple agents upgraded by ID', async () => {
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

        medplum.router.router.add('GET', 'Agent/$upgrade', async () => {
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

        await expect(main(['node', 'index.js', 'agent', 'upgrade', ...agentIds])).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', `$upgrade?_id=${encodeURIComponent(agentIds.join(','))}`).href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });

    describe('By criteria', () => {
      test('Basic case', async () => {
        const agentId = randomUUID();
        const agent = await medplum.createResource({
          id: agentId,
          resourceType: 'Agent',
          name: 'Test Agent 1',
          status: 'active',
        } satisfies Agent);

        medplum.router.router.add('GET', 'Agent/$upgrade', async () => {
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

        await expect(
          main(['node', 'index.js', 'agent', 'upgrade', '--criteria', 'Agent?name=Test Agent'])
        ).resolves.toBeUndefined();
        expect(medplumGetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            href: medplum.fhirUrl('Agent', '$upgrade?name=Test+Agent').href,
          }),
          expect.objectContaining({ cache: 'reload' })
        );
        expect(processError).not.toHaveBeenCalled();
      });
    });

    test('Upgrade to specified version', async () => {
      const agentId = randomUUID();
      const agent = await medplum.createResource({
        id: agentId,
        resourceType: 'Agent',
        name: 'Test Agent 1',
        status: 'active',
      } satisfies Agent);

      medplum.router.router.add('GET', 'Agent/$upgrade', async () => {
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

      await expect(
        main(['node', 'index.js', 'agent', 'upgrade', '--criteria', 'Agent?name=Test Agent', '--agentVersion', '4.3.1'])
      ).resolves.toBeUndefined();
      expect(medplumGetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: medplum.fhirUrl('Agent', '$upgrade?name=Test+Agent&version=4.3.1').href,
        }),
        expect.objectContaining({ cache: 'reload' })
      );
      expect(processError).not.toHaveBeenCalled();
    });

    test('Force upgrade', async () => {
      const agentId = randomUUID();
      const agent = await medplum.createResource({
        id: agentId,
        resourceType: 'Agent',
        name: 'Test Agent 1',
        status: 'active',
      } satisfies Agent);

      medplum.router.router.add('GET', 'Agent/$upgrade', async () => {
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

      await expect(
        main([
          'node',
          'index.js',
          'agent',
          'upgrade',
          '--criteria',
          'Agent?name=Test Agent',
          '--agentVersion',
          '4.3.1',
          '--force',
        ])
      ).resolves.toBeUndefined();
      expect(medplumGetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          href: medplum.fhirUrl('Agent', '$upgrade?name=Test+Agent&version=4.3.1&force=true').href,
        }),
        expect.objectContaining({ cache: 'reload' })
      );
      expect(processError).not.toHaveBeenCalled();
    });
  });
});

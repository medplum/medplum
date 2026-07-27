// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeErrorString } from '@medplum/core';
import type { Agent, AgentChannel, Endpoint } from '@medplum/fhirtypes';
import { getFreePort } from '@medplum/hl7';
import net from 'node:net';
import type { ChannelConfigIssue } from './channel';
import {
  configIssuesToError,
  createIssueCollector,
  parseAgentSettings,
  probePort,
  probePorts,
  toOperationOutcomeIssue,
  validateChannelStructure,
} from './config-validation';
import { resolveRetryPolicy } from './hl7';

function makeChannel(name: string, address: string, status: Endpoint['status'] = 'active'): [AgentChannel, Endpoint] {
  return [
    { name, endpoint: { reference: `Endpoint/${name}` } },
    { resourceType: 'Endpoint', status, address, connectionType: {}, payloadType: [] },
  ];
}

/**
 * Runs `validateChannelStructure` over `[definition, endpoint]` pairs.
 * @param pairs - The channel definitions paired with their resolved endpoints.
 * @returns The valid channels and every issue found.
 */
function validate(pairs: [AgentChannel, Endpoint | undefined][]): ReturnType<typeof validateChannelStructure> {
  return validateChannelStructure(
    pairs.map(([definition]) => definition),
    pairs.map(([, endpoint]) => endpoint)
  );
}

function codes(issues: ChannelConfigIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('validateChannelStructure', () => {
  test('Accepts a valid channel of each type', () => {
    const { valid, issues } = validate([
      makeChannel('hl7', 'mllp://0.0.0.0:9001'),
      makeChannel('dicom', 'dicom://0.0.0.0:10001'),
      makeChannel('bytes', 'tcp://0.0.0.0:9005?startChar=a&endChar=b'),
    ]);
    expect(issues).toStrictEqual([]);
    expect(valid.map((candidate) => [candidate.definition.name, candidate.type, candidate.port])).toStrictEqual([
      ['hl7', 'HL7_V2', 9001],
      ['dicom', 'DICOM', 10001],
      ['bytes', 'BYTE_STREAM', 9005],
    ]);
  });

  test('Keeps channels whose endpoint is off -- they are validated, just not run', () => {
    const { valid, issues } = validate([makeChannel('hl7', 'mllp://0.0.0.0:9001', 'off')]);
    expect(issues).toStrictEqual([]);
    expect(valid).toHaveLength(1);
  });

  test('Rejects an endpoint that could not be read', () => {
    const [definition] = makeChannel('hl7', 'mllp://0.0.0.0:9001');
    const { valid, issues } = validate([[definition, undefined]]);
    expect(valid).toStrictEqual([]);
    expect(codes(issues)).toStrictEqual(['missing-endpoint']);
    expect(issues[0].message).toContain('Endpoint/hl7');
  });

  test('Rejects an empty address', () => {
    const { issues } = validate([makeChannel('test', '')]);
    expect(codes(issues)).toStrictEqual(['empty-address']);
    expect(issues[0].message).toBe("Invalid empty endpoint address for channel 'test'");
  });

  test('Rejects an unparseable address', () => {
    const { issues } = validate([makeChannel('test', 'not a url')]);
    expect(codes(issues)).toStrictEqual(['invalid-address']);
    expect(issues[0].message).toContain("Error while validating endpoint address for channel 'test'");
  });

  test('Rejects an unsupported scheme', () => {
    const { issues } = validate([makeChannel('test', 'foo:')]);
    expect(codes(issues)).toStrictEqual(['unsupported-endpoint-type']);
    expect(issues[0].message).toBe('Unsupported endpoint type: foo:');
  });

  // An address with no port used to parse fine and reach `listen(NaN)`, which binds an
  // arbitrary free port -- the channel comes up somewhere nobody configured.
  test.each([
    ['no port at all', 'mllp://0.0.0.0'],
    ['port 0', 'mllp://0.0.0.0:0'],
  ])('Rejects an address with %s', (_label, address) => {
    const { valid, issues } = validate([makeChannel('test', address)]);
    expect(valid).toStrictEqual([]);
    expect(codes(issues)).toStrictEqual(['invalid-port']);
  });

  // Out-of-range and non-numeric ports don't reach the port rule: `new URL` rejects them first.
  test.each([
    ['a port above the maximum', 'mllp://0.0.0.0:70000'],
    ['a non-numeric port', 'mllp://0.0.0.0:abc'],
  ])('Rejects an address with %s', (_label, address) => {
    const { valid, issues } = validate([makeChannel('test', address)]);
    expect(valid).toStrictEqual([]);
    expect(codes(issues)).toStrictEqual(['invalid-address']);
  });

  test('Rejects two channels declaring the same port', () => {
    const { valid, issues } = validate([
      makeChannel('hl7-a', 'mllp://0.0.0.0:9001'),
      makeChannel('hl7-b', 'mllp://0.0.0.0:9001'),
    ]);
    expect(valid.map((candidate) => candidate.definition.name)).toStrictEqual(['hl7-a']);
    expect(codes(issues)).toStrictEqual(['duplicate-port']);
    expect(issues[0].message).toContain("Both 'hl7-a' (mllp://0.0.0.0:9001) and 'hl7-b' (mllp://0.0.0.0:9001)");
  });

  test('Rejects two channels with the same name', () => {
    const { valid, issues } = validate([
      makeChannel('hl7', 'mllp://0.0.0.0:9001'),
      makeChannel('hl7', 'mllp://0.0.0.0:9002'),
    ]);
    expect(valid).toHaveLength(1);
    expect(codes(issues)).toStrictEqual(['duplicate-channel-name']);
  });

  // The point of the whole validate-first pipeline: one reload tells the operator
  // everything that is wrong, rather than one problem per round trip.
  test('Reports every problem at once', () => {
    const { issues } = validate([
      makeChannel('good', 'mllp://0.0.0.0:9001'),
      makeChannel('empty', ''),
      makeChannel('unparseable', '://////'),
      makeChannel('bad-scheme', 'foo:'),
      makeChannel('bad-port', 'mllp://0.0.0.0'),
    ]);
    expect(codes(issues)).toStrictEqual([
      'empty-address',
      'invalid-address',
      'unsupported-endpoint-type',
      'invalid-port',
    ]);

    const err = configIssuesToError(issues, '4 problem(s) found in agent config; no changes applied');
    const message = normalizeErrorString(err);
    for (const name of ['empty', 'unparseable', 'bad-scheme', 'bad-port']) {
      expect(message).toContain(name);
    }
  });
});

describe('parseAgentSettings', () => {
  function agentWithSettings(setting: Agent['setting']): Agent {
    return { resourceType: 'Agent', name: 'Test Agent', status: 'active', setting };
  }

  test('Defaults everything when there are no settings', () => {
    const { settings, issues } = parseAgentSettings(agentWithSettings(undefined));
    expect(issues).toStrictEqual([]);
    expect(settings).toMatchObject({
      keepAlive: false,
      durableQueueOn: false,
      strictConfigValidation: false,
      maxClientsPerRemote: undefined,
      channelRetrySettings: { mode: undefined },
    });
  });

  test('Reads valid settings', () => {
    const { settings, issues } = parseAgentSettings(
      agentWithSettings([
        { name: 'keepAlive', valueBoolean: true },
        { name: 'maxClientsPerRemote', valueInteger: 4 },
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: '/tmp/queue.sqlite' },
        { name: 'queueRetentionDays', valueInteger: 30 },
        { name: 'channelRetryMode', valueString: 'Normal' },
        { name: 'channelAutoRetryBackoffMultiplier', valueDecimal: 1.5 },
        { name: 'strictConfigValidation', valueBoolean: true },
      ])
    );
    expect(issues).toStrictEqual([]);
    expect(settings).toMatchObject({
      keepAlive: true,
      maxClientsPerRemote: 4,
      durableQueueOn: true,
      queueDbPath: '/tmp/queue.sqlite',
      queueRetentionDays: 30,
      strictConfigValidation: true,
      channelRetrySettings: { mode: 'normal', backoffMultiplier: 1.5 },
    });
  });

  test('Warns on an invalid channelRetryMode and ignores it', () => {
    const { settings, issues } = parseAgentSettings(
      agentWithSettings([{ name: 'channelRetryMode', valueString: 'bogus' }])
    );
    expect(codes(issues)).toStrictEqual(['invalid-setting']);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].field).toBe('setting.channelRetryMode');
    expect(settings.channelRetrySettings.mode).toBeUndefined();
  });

  test('Warns on a negative retention setting and ignores it', () => {
    const { settings, issues } = parseAgentSettings(
      agentWithSettings([{ name: 'queueRetentionDays', valueInteger: -1 }])
    );
    expect(codes(issues)).toStrictEqual(['invalid-setting']);
    expect(settings.queueRetentionDays).toBeUndefined();
  });

  test('Warns on a non-positive backoff multiplier and ignores it', () => {
    const { settings, issues } = parseAgentSettings(
      agentWithSettings([{ name: 'channelAutoRetryBackoffMultiplier', valueDecimal: 0 }])
    );
    expect(codes(issues)).toStrictEqual(['invalid-setting']);
    expect(settings.channelRetrySettings.backoffMultiplier).toBeUndefined();
  });
});

describe('createIssueCollector', () => {
  test('Turns warnings into issues and drops everything else', () => {
    const { log, issues } = createIssueCollector('my-channel');
    log.info('ignored');
    log.error('ignored');
    log.debug('ignored');
    log.warn('something is off');
    expect(issues).toStrictEqual([
      { severity: 'warning', code: 'invalid-param', channel: 'my-channel', message: 'something is off' },
    ]);
    expect(log.clone()).toBe(log);
  });

  // The collector exists so validation runs the *real* parsers rather than a second copy of
  // their rules -- including cross-field ones no reimplementation would be likely to mirror.
  test('Captures the cross-field warning resolveRetryPolicy emits', () => {
    const { log, issues } = createIssueCollector('hl7');
    resolveRetryPolicy({}, new URLSearchParams('retryMode=guaranteed&autoRetryMaxAttempts=5'), log);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('retryMode=guaranteed retries indefinitely');
  });
});

describe('toOperationOutcomeIssue', () => {
  test('Maps an error, carrying the location in diagnostics', () => {
    expect(
      toOperationOutcomeIssue({
        severity: 'error',
        code: 'invalid-port',
        channel: 'hl7',
        field: 'endpoint.address',
        message: 'bad port',
      })
    ).toStrictEqual({
      severity: 'error',
      code: 'invalid',
      details: { text: 'bad port' },
      diagnostics: 'hl7.endpoint.address',
    });
  });

  test('Maps a warning without a location', () => {
    expect(toOperationOutcomeIssue({ severity: 'warning', code: 'invalid-param', message: 'hmm' })).toStrictEqual({
      severity: 'warning',
      code: 'informational',
      details: { text: 'hmm' },
    });
  });
});

describe('probePort', () => {
  let occupied: net.Server | undefined;

  afterEach(async () => {
    if (occupied) {
      await new Promise<void>((resolve) => {
        occupied?.close(() => resolve());
      });
      occupied = undefined;
    }
  });

  test('Resolves for a free port', async () => {
    await expect(probePort(await getFreePort())).resolves.toBeUndefined();
  });

  test('Rejects for a port someone else holds', async () => {
    const port = await getFreePort();
    occupied = net.createServer();
    await new Promise<void>((resolve) => {
      occupied?.listen(port, resolve);
    });

    await expect(probePort(port)).rejects.toThrow(/EADDRINUSE/);
  });

  test('Reports one issue per unavailable port, and none for the rest', async () => {
    const takenPort = await getFreePort();
    occupied = net.createServer();
    await new Promise<void>((resolve) => {
      occupied?.listen(takenPort, resolve);
    });

    const issues = await probePorts([
      { port: takenPort, channel: 'taken' },
      { port: await getFreePort(), channel: 'free' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'port-unavailable', channel: 'taken' });
    expect(issues[0].message).toContain('EADDRINUSE');
  });
});

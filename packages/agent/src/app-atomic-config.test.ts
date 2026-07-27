// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentError, AgentMessage, AgentReloadConfigRequest, WithId } from '@medplum/core';
import { allOk, ContentType, createReference, getReferenceString, LogLevel, MEDPLUM_VERSION } from '@medplum/core';
import type { Agent, AgentChannel, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { getFreePort } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import { App } from './app';
import type { AppliedConfigSnapshot } from './config-snapshot';
import { APPLIED_CONFIG_FILENAME } from './config-snapshot';
import type * as AgentConstants from './constants';
import { AgentHl7Channel } from './hl7';
import { createEndpointWithRandomPort, createTestWinstonLogger, waitFor } from './test-utils';

vi.mock('./constants', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentConstants>();
  return { ...actual, RETRY_WAIT_DURATION_MS: 200, CLIENT_RELEASE_COUNTDOWN_MS: 0 };
});

vi.mock('./pid', () => ({
  createPidFile: vi.fn(),
  getPidFilePath: vi.fn(() => 'pid/file/path'),
  waitForPidFile: vi.fn(async () => undefined),
  removePidFile: vi.fn(),
  isAppRunning: vi.fn(() => false),
  forceKillApp: vi.fn(),
}));

const HL7_ENDPOINT = {
  resourceType: 'Endpoint',
  status: 'active',
  address: 'mllp://0.0.0.0:9001',
  connectionType: { code: ContentType.HL7_V2 },
  payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
} satisfies Endpoint;

interface HarnessState {
  mySocket?: Client;
  connected: boolean;
  reloadResponses: number;
  errors: AgentError[];
}

function createHarness(): { state: HarnessState; mockServer: Server } {
  const state: HarnessState = { connected: false, reloadResponses: 0, errors: [] };
  const mockServer = new Server('wss://example.com/ws/agent');
  mockServer.on('connection', (socket: Client) => {
    state.mySocket = socket;
    socket.on('message', (data) => {
      const command = JSON.parse((data as Buffer).toString('utf8')) as AgentMessage;
      switch (command.type) {
        case 'agent:connect:request':
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          state.connected = true;
          break;
        case 'agent:heartbeat:request':
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response' })));
          break;
        case 'agent:reloadconfig:response':
          state.reloadResponses++;
          break;
        case 'agent:error':
          state.errors.push(command);
          break;
        default:
          break;
      }
    });
  });
  return { state, mockServer };
}

/**
 * Asks the agent to reload and waits for it to answer, either way.
 * @param state - The harness state tracking the agent's replies.
 * @param agent - The agent being reloaded, used to build the callback id.
 */
async function requestReload(state: HarnessState, agent: Agent): Promise<void> {
  const before = state.reloadResponses + state.errors.length;
  state.mySocket?.send(
    JSON.stringify({
      type: 'agent:reloadconfig:request',
      callback: `${getReferenceString(agent)}-${randomUUID()}`,
    } satisfies AgentReloadConfigRequest)
  );
  await waitFor(() => state.reloadResponses + state.errors.length > before, 5000, 'reload to be answered');
}

/**
 * Holds a port open the way an unrelated process would.
 * @param port - The port to occupy.
 * @returns The listening server, for the caller to close.
 */
async function occupyPort(port: number): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((done) => {
    server.listen(port, done);
  });
  return server;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((done) => {
    server.close(() => done());
  });
}

describe('Atomic agent config', () => {
  let medplum: MockClient;
  let bot: Bot;
  let originalConsoleLog: typeof console.log;

  beforeEach(async () => {
    originalConsoleLog = console.log;
    console.log = vi.fn();
    medplum = new MockClient();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => [allOk, {} as Resource]);
    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  /**
   * Creates an agent with one HL7 channel per name, each on its own free port.
   * @param names - The channel names to create.
   * @returns The created agent, its endpoints, and its channel definitions.
   */
  async function createAgent(
    names: string[]
  ): Promise<{ agent: WithId<Agent>; endpoints: Endpoint[]; channels: AgentChannel[] }> {
    const endpoints: Endpoint[] = [];
    for (const _name of names) {
      const [endpoint] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
      endpoints.push(endpoint);
    }
    const channels: AgentChannel[] = names.map((name, i) => ({
      name,
      endpoint: createReference(endpoints[i]),
      targetReference: createReference(bot),
    }));
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Test Agent',
      status: 'active',
      channel: channels,
    });
    return { agent, endpoints, channels };
  }

  async function startApp(
    agent: WithId<Agent>,
    state: HarnessState,
    options?: ConstructorParameters<typeof App>[3]
  ): Promise<App> {
    const app = new App(medplum, agent.id, LogLevel.INFO, options);
    app.heartbeatPeriod = 100;
    await app.start();
    await waitFor(() => state.connected, 5000, 'websocket to connect');
    return app;
  }

  // The core promise: a config with a problem anywhere in it changes nothing anywhere.
  test('A single invalid channel leaves the entire running config untouched', async () => {
    const { state, mockServer } = createHarness();
    const { agent, endpoints, channels } = await createAgent(['hl7-a', 'hl7-b']);
    const app = await startApp(agent, state);

    const channelA = app.channels.get('hl7-a') as AgentHl7Channel;
    const channelB = app.channels.get('hl7-b') as AgentHl7Channel;
    const addressA = channelA.getEndpoint().address;
    const configBefore = app.getAgentConfig();

    // A perfectly good change to one channel, alongside a broken address on another.
    const [movedEndpointA] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
    await medplum.updateResource<Agent>({
      ...agent,
      channel: [
        { name: 'hl7-a', endpoint: createReference(movedEndpointA), targetReference: createReference(bot) },
        channels[1],
      ],
    });
    await medplum.updateResource<Endpoint>({ ...endpoints[1], address: 'not a url' });

    await requestReload(state, agent);

    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].body).toContain("Error while validating endpoint address for channel 'hl7-b'");
    expect(state.reloadResponses).toBe(0);

    // Nothing moved: not the channel instances, not the address of the channel whose change
    // was valid, and not the config the agent reports it is running.
    expect(app.channels.size).toBe(2);
    expect(app.channels.get('hl7-a')).toBe(channelA);
    expect(app.channels.get('hl7-b')).toBe(channelB);
    expect(channelA.getEndpoint().address).toBe(addressA);
    expect(app.getAgentConfig()).toBe(configBefore);

    await app.stop();
    mockServer.stop();
  });

  test('Reports every problem in the config at once', async () => {
    const { state, mockServer } = createHarness();
    const { agent, endpoints } = await createAgent(['hl7-a', 'hl7-b']);
    const app = await startApp(agent, state);

    await medplum.updateResource<Endpoint>({ ...endpoints[0], address: '' });
    await medplum.updateResource<Endpoint>({ ...endpoints[1], address: 'foo:' });

    await requestReload(state, agent);

    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].body).toContain("Invalid empty endpoint address for channel 'hl7-a'");
    expect(state.errors[0].body).toContain('Unsupported endpoint type: foo:');
    expect(state.errors[0].body).toContain('2 problem(s) found in agent config; no changes applied');

    await app.stop();
    mockServer.stop();
  });

  test('Rejects a config that would put a channel on a port another process holds', async () => {
    const { state, mockServer } = createHarness();
    const { agent, channels } = await createAgent(['hl7-a']);
    const app = await startApp(agent, state);

    const takenPort = await getFreePort();
    const squatter = await occupyPort(takenPort);
    const contestedEndpoint = await medplum.createResource<Endpoint>({
      ...HL7_ENDPOINT,
      address: `mllp://0.0.0.0:${takenPort}`,
    });
    await medplum.updateResource<Agent>({
      ...agent,
      channel: [
        ...channels,
        { name: 'hl7-new', endpoint: createReference(contestedEndpoint), targetReference: createReference(bot) },
      ],
    });

    // Without the pre-bind probe this would not error at all: Hl7Server retries EADDRINUSE
    // forever, so the reload would simply never answer.
    await requestReload(state, agent);

    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].body).toContain('EADDRINUSE');
    expect(state.errors[0].body).toContain('hl7-new');
    expect(app.channels.size).toBe(1);

    await closeServer(squatter);
    await app.stop();
    mockServer.stop();
  });

  test('Does not probe a port the agent already holds', async () => {
    const { state, mockServer } = createHarness();
    const { agent, endpoints } = await createAgent(['hl7-a']);
    const app = await startApp(agent, state);
    const channel = app.channels.get('hl7-a') as AgentHl7Channel;

    // Same port, new params -- the channel reconfigures in place and keeps its listener.
    await medplum.updateResource<Endpoint>({ ...endpoints[0], address: `${endpoints[0].address}?enhanced=true` });
    await requestReload(state, agent);

    expect(state.errors).toStrictEqual([]);
    expect(state.reloadResponses).toBe(1);
    expect(app.channels.get('hl7-a')).toBe(channel);

    await app.stop();
    mockServer.stop();
  });

  test('Promotes warnings to errors when strictConfigValidation is on', async () => {
    const { state, mockServer } = createHarness();
    const { agent, endpoints } = await createAgent(['hl7-a']);
    const app = await startApp(agent, state);

    // A bad param on its own is a warning: the config still applies.
    await medplum.updateResource<Endpoint>({ ...endpoints[0], address: `${endpoints[0].address}?enhanced=bogus` });
    await requestReload(state, agent);
    expect(state.reloadResponses).toBe(1);
    expect(state.errors).toStrictEqual([]);

    // With strict validation on, the same param is refused.
    await medplum.updateResource<Agent>({
      ...agent,
      setting: [{ name: 'strictConfigValidation', valueBoolean: true }],
    });
    await requestReload(state, agent);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].body).toContain("Invalid enhanced value 'bogus'");
    expect(state.reloadResponses).toBe(1);

    await app.stop();
    mockServer.stop();
  });

  describe('Last-good config snapshot', () => {
    test('Records the config once every listener is bound, and leaves it alone when a reload fails', async () => {
      const [logger, cleanupLogger] = createTestWinstonLogger();
      const snapshotPath = `${logger.getLogDir() as string}/${APPLIED_CONFIG_FILENAME}`;
      const { state, mockServer } = createHarness();
      const { agent, endpoints } = await createAgent(['hl7-a']);
      const app = await startApp(agent, state, { mainLogger: logger, channelLogger: logger });

      await waitFor(() => existsSync(snapshotPath), 5000, 'snapshot to be written');
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as AppliedConfigSnapshot;
      expect(snapshot.agent.id).toBe(agent.id);
      expect(snapshot.agentVersion).toBe(MEDPLUM_VERSION);
      expect(snapshot.endpoints).toHaveLength(1);
      expect(snapshot.endpoints[0].address).toBe(endpoints[0].address);

      // A config that never applied must never be recorded as one that did.
      await medplum.updateResource<Endpoint>({ ...endpoints[0], address: 'foo:' });
      await requestReload(state, agent);
      expect(state.errors).toHaveLength(1);
      expect((JSON.parse(readFileSync(snapshotPath, 'utf8')) as AppliedConfigSnapshot).appliedAt).toBe(
        snapshot.appliedAt
      );

      await app.stop();
      mockServer.stop();
      cleanupLogger();
    });

    test('Ignores a snapshot belonging to a different agent', async () => {
      const [logger, cleanupLogger] = createTestWinstonLogger();
      const snapshotPath = `${logger.getLogDir() as string}/${APPLIED_CONFIG_FILENAME}`;
      writeFileSync(
        snapshotPath,
        JSON.stringify({
          appliedAt: new Date().toISOString(),
          agentVersion: MEDPLUM_VERSION,
          agent: { resourceType: 'Agent', id: randomUUID(), name: 'Someone else', status: 'active' },
          endpoints: [],
        } satisfies AppliedConfigSnapshot)
      );

      const { mockServer } = createHarness();
      const { agent } = await createAgent(['hl7-a']);
      vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('server unreachable'));

      const app = new App(medplum, agent.id, LogLevel.INFO, { mainLogger: logger, channelLogger: logger });
      await expect(app.start()).rejects.toThrow(/server unreachable/);

      await app.stop();
      mockServer.stop();
      cleanupLogger();
    });
  });

  describe('Rollback', () => {
    test('Returns to the last-good config when a channel fails to start', async () => {
      const { state, mockServer } = createHarness();
      const { agent, channels } = await createAgent(['hl7-a']);
      const app = await startApp(agent, state);
      const channelA = app.channels.get('hl7-a') as AgentHl7Channel;

      const [newEndpoint] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
      await medplum.updateResource<Agent>({
        ...agent,
        channel: [
          ...channels,
          { name: 'hl7-new', endpoint: createReference(newEndpoint), targetReference: createReference(bot) },
        ],
      });

      const startSpy = vi
        .spyOn(AgentHl7Channel.prototype, 'start')
        .mockRejectedValueOnce(new Error('could not bind, sorry'));

      await requestReload(state, agent);

      // The operator is told what actually went wrong, not what the rollback did.
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].body).toContain('could not bind, sorry');
      // And the agent is left running the config that worked.
      expect(app.channels.size).toBe(1);
      expect(app.channels.get('hl7-a')).toBe(channelA);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Rolled back to last-good config successfully'));

      startSpy.mockRestore();
      await app.stop();
      mockServer.stop();
    });

    test('Reports a rollback that also fails, exactly once', async () => {
      const { state, mockServer } = createHarness();
      const { agent, endpoints } = await createAgent(['hl7-a', 'hl7-b']);
      const app = await startApp(agent, state);

      // Drop hl7-a and add hl7-new. Rolling back has to bring hl7-a *back*, which means
      // start()ing it -- so a start() that always fails fails the rollback too.
      const [newEndpoint] = await createEndpointWithRandomPort(medplum, HL7_ENDPOINT);
      await medplum.updateResource<Agent>({
        ...agent,
        channel: [
          { name: 'hl7-b', endpoint: createReference(endpoints[1]), targetReference: createReference(bot) },
          { name: 'hl7-new', endpoint: createReference(newEndpoint), targetReference: createReference(bot) },
        ],
      });

      const startSpy = vi.spyOn(AgentHl7Channel.prototype, 'start').mockRejectedValue(new Error('nothing starts now'));

      await requestReload(state, agent);

      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].body).toContain('nothing starts now');
      const criticalLogs = vi
        .mocked(console.log)
        .mock.calls.filter(([msg]) => typeof msg === 'string' && msg.includes('CRITICAL: rollback'));
      expect(criticalLogs).toHaveLength(1);

      startSpy.mockRestore();
      await app.stop();
      mockServer.stop();
    });
  });

  describe('Boot fallback', () => {
    test('Starts from the last-good config when the server is unreachable', async () => {
      const [logger, cleanupLogger] = createTestWinstonLogger();
      const snapshotPath = `${logger.getLogDir() as string}/${APPLIED_CONFIG_FILENAME}`;
      const { mockServer } = createHarness();
      const { agent, endpoints } = await createAgent(['hl7-a']);

      writeFileSync(
        snapshotPath,
        JSON.stringify({
          appliedAt: new Date().toISOString(),
          agentVersion: MEDPLUM_VERSION,
          agent,
          endpoints,
        } satisfies AppliedConfigSnapshot)
      );

      vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('server unreachable'));

      const app = new App(medplum, agent.id, LogLevel.INFO, { mainLogger: logger, channelLogger: logger });
      app.heartbeatPeriod = 100;
      await app.start();

      expect(app.channels.size).toBe(1);
      expect((app.channels.get('hl7-a') as AgentHl7Channel).getEndpoint().address).toBe(endpoints[0].address);

      await app.stop();
      mockServer.stop();
      cleanupLogger();
    });

    test('Starts from the last-good config when the server config no longer validates', async () => {
      const [logger, cleanupLogger] = createTestWinstonLogger();
      const snapshotPath = `${logger.getLogDir() as string}/${APPLIED_CONFIG_FILENAME}`;
      const { mockServer } = createHarness();
      const { agent, endpoints } = await createAgent(['hl7-a', 'hl7-b']);

      writeFileSync(
        snapshotPath,
        JSON.stringify({
          appliedAt: new Date().toISOString(),
          agentVersion: MEDPLUM_VERSION,
          agent,
          endpoints,
        } satisfies AppliedConfigSnapshot)
      );

      // Someone points both channels at the same port.
      await medplum.updateResource<Endpoint>({ ...endpoints[1], address: endpoints[0].address });

      const app = new App(medplum, agent.id, LogLevel.INFO, { mainLogger: logger, channelLogger: logger });
      app.heartbeatPeriod = 100;
      await app.start();

      expect(app.channels.size).toBe(2);
      expect((app.channels.get('hl7-b') as AgentHl7Channel).getEndpoint().address).toBe(endpoints[1].address);

      await app.stop();
      mockServer.stop();
      cleanupLogger();
    });

    test('Still refuses to start when there is nothing to fall back to', async () => {
      const [logger, cleanupLogger] = createTestWinstonLogger();
      const { mockServer } = createHarness();
      const { agent } = await createAgent(['hl7-a']);
      vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('server unreachable'));

      const app = new App(medplum, agent.id, LogLevel.INFO, { mainLogger: logger, channelLogger: logger });
      await expect(app.start()).rejects.toThrow(/server unreachable/);

      await app.stop();
      mockServer.stop();
      cleanupLogger();
    });
  });

  // The outgoing agent still holds every port until we delete the upgrade manifest, which
  // happens after this check -- probing there would fail every zero-downtime upgrade.
  test('Skips the port probe while an upgrade is in progress', async () => {
    const manifestPath = resolve(__dirname, 'upgrade.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({ previousVersion: MEDPLUM_VERSION, targetVersion: MEDPLUM_VERSION, callback: null })
    );

    const { state, mockServer } = createHarness();
    const { agent, endpoints } = await createAgent(['hl7-a']);

    // Stand in for the outgoing agent, still listening on the port we are about to take.
    const outgoing = await occupyPort(Number.parseInt(new URL(endpoints[0].address).port, 10));

    const app = new App(medplum, agent.id, LogLevel.INFO);
    app.heartbeatPeriod = 100;
    // start() would reject here if the probe ran: the port is held.
    const startPromise = app.start();
    await waitFor(() => state.connected, 5000, 'websocket to connect');
    // Release the port the way the installer stopping the old agent would.
    await closeServer(outgoing);
    await startPromise;

    expect(app.channels.size).toBe(1);

    await app.stop();
    mockServer.stop();
    if (existsSync(manifestPath)) {
      rmSync(manifestPath);
    }
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentHandle, AgentLauncher, SelectLauncherOptions } from '../../agent-process';
import { createLauncher } from '../../agent-process';
import type { AgentMaterialization, ScenarioEvent, ScenarioSpec } from '../../types';
import type { Backend } from '../backend';
import { FakeMedplumServer } from '../fake-server/fake-medplum-server';

export interface HybridBackendOptions {
  /** How to launch agent processes. Defaults to the platform-appropriate launcher. */
  launcher?: SelectLauncherOptions;
  /** Default agent version to launch (binary/installer launchers only). */
  defaultAgentVersion?: string;
  /**
   * Client credentials the spawned agents authenticate with. Any non-empty pair
   * works — the fake server doesn't verify. Default: 'harness'/'harness'.
   */
  clientId?: string;
  clientSecret?: string;
  /** Per-agent override of clientId/clientSecret (rarely useful in hybrid mode). */
  agentCredentials?: Record<string, { clientId: string; clientSecret: string }>;
}

interface RegisteredAgent {
  materialization: AgentMaterialization;
  handle?: AgentHandle;
}

/**
 * HybridBackend — real @medplum/agent processes against a fake medplum/server.
 *
 * Useful when you want exercise the real agent's connect / reconnect / heartbeat
 * / HL7 channel code paths but don't want to stand up an actual medplum/server.
 * The fake server speaks just enough of the agent protocol for the handshake +
 * heartbeat + transmit messaging; see FakeMedplumServer for what's stubbed.
 *
 * Restart / upgrade semantics are delegated to the fake server, which makes
 * `simulate-server-upgrade` / `simulate-server-restart` work end-to-end against
 * a real agent process (the real path RealBackend can't offer without an
 * external bounce hook).
 */
export class HybridBackend implements Backend {
  readonly kind = 'real' as const;
  readonly options: HybridBackendOptions;
  private launcher: AgentLauncher;
  private fakeServer: FakeMedplumServer;
  private baseUrl?: string;
  private agents = new Map<string, RegisteredAgent>();
  private emit: (e: ScenarioEvent) => void = () => undefined;
  private startedAtMs = 0;

  constructor(options: HybridBackendOptions = {}) {
    this.options = options;
    this.launcher = createLauncher(options.launcher ?? {});
    this.fakeServer = new FakeMedplumServer();
  }

  async init(_scenario: ScenarioSpec, emit: (e: ScenarioEvent) => void): Promise<void> {
    this.emit = emit;
    this.startedAtMs = Date.now();
    const { baseUrl } = await this.fakeServer.start(emit);
    this.baseUrl = baseUrl;
    await this.launcher.prepare(this.options.defaultAgentVersion);
    this.record('backend.ready', { launcher: this.launcher.kind, baseUrl });
  }

  async shutdown(): Promise<void> {
    for (const [nodeId, agent] of this.agents) {
      if (agent.handle) {
        await agent.handle.stop().catch(() => undefined);
        this.record('agent.stopped', { nodeId });
      }
    }
    this.agents.clear();
    await this.fakeServer.stop();
  }

  async registerAgent(nodeId: string, materialization: AgentMaterialization): Promise<void> {
    this.agents.set(nodeId, { materialization });
    this.fakeServer.registerAgent(materialization);
    this.record('agent.registered', { nodeId, agentId: materialization.agent.id });
  }

  async startAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (agent.handle) return;
    if (!this.baseUrl) throw new Error('HybridBackend not initialized — call init() first');
    const creds = this.options.agentCredentials?.[nodeId] ?? {
      clientId: this.options.clientId ?? 'harness',
      clientSecret: this.options.clientSecret ?? 'harness',
    };
    const agentResourceId = agent.materialization.agent.id;
    if (!agentResourceId) {
      throw new Error(`agent[${nodeId}] materialization has no id`);
    }
    agent.handle = await this.launcher.spawn({
      nodeId,
      baseUrl: this.baseUrl,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      agentId: agentResourceId,
      version: this.options.defaultAgentVersion,
    });
    await agent.handle.waitUntilRunning();
    this.record('agent.started', { nodeId, pid: agent.handle.pid, launcher: agent.handle.kind });
  }

  async stopAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (!agent.handle) return;
    await agent.handle.stop();
    agent.handle = undefined;
    this.record('agent.stopped', { nodeId });
  }

  async reloadAgentConfig(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (agent.handle?.reload) {
      await agent.handle.reload();
    } else {
      await this.stopAgent(nodeId);
      await this.startAgent(nodeId);
    }
    this.record('agent.reload-config', { nodeId });
  }

  async upgradeAgent(nodeId: string, version: string): Promise<void> {
    await this.stopAgent(nodeId);
    await this.launcher.prepare(version);
    const oldDefault = this.options.defaultAgentVersion;
    this.options.defaultAgentVersion = version;
    try {
      await this.startAgent(nodeId);
    } finally {
      this.options.defaultAgentVersion = oldDefault;
    }
    this.record('agent.upgrade', { nodeId, version });
  }

  simulateServerUpgrade(opts: { downtimeMs: number }): Promise<void> {
    return this.fakeServer.simulateServerUpgrade(opts);
  }

  simulateServerRestart(opts: { downtimeMs: number; graceful?: boolean }): Promise<void> {
    return this.fakeServer.simulateServerRestart(opts);
  }

  resolveAgentChannelTarget(nodeId: string, channelName: string): { host: string; port: number } {
    const agent = this.getAgent(nodeId);
    const channel = agent.materialization.agent.channel?.find((c) => c.name === channelName);
    if (!channel) {
      throw new Error(`agent[${nodeId}] has no channel named '${channelName}'`);
    }
    const endpointId = channel.endpoint?.reference?.split('/')[1];
    const endpoint = agent.materialization.endpoints.find((e) => e.id === endpointId);
    if (!endpoint?.address) {
      throw new Error(`agent[${nodeId}] channel '${channelName}' has no resolvable endpoint`);
    }
    const url = new URL(endpoint.address.replace(/^mllp:/, 'tcp:'));
    return { host: url.hostname === '0.0.0.0' ? '127.0.0.1' : url.hostname, port: Number(url.port) };
  }

  /** Direct access for tests / advanced wiring. */
  getFakeServer(): FakeMedplumServer {
    return this.fakeServer;
  }

  private getAgent(nodeId: string): RegisteredAgent {
    const a = this.agents.get(nodeId);
    if (!a) throw new Error(`agent[${nodeId}] not registered with backend`);
    return a;
  }

  private record(type: string, data?: unknown): void {
    this.emit({ atMs: Date.now() - this.startedAtMs, type, data });
  }
}

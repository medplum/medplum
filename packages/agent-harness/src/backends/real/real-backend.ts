// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentHandle, AgentLauncher, SelectLauncherOptions } from '../../agent-process';
import { createLauncher } from '../../agent-process';
import type { AgentMaterialization, ScenarioEvent, ScenarioSpec } from '../../types';
import type { Backend } from '../backend';

export interface RealBackendOptions {
  /** Base URL of a running medplum/server, e.g. http://localhost:8103/. */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /**
   * Optional client credentials per agent. If absent, all agents share the
   * outer `clientId`/`clientSecret`. v0 uses the outer set; per-agent
   * credentials is a follow-up.
   */
  agentCredentials?: Record<string, { clientId: string; clientSecret: string }>;
  /** How to launch agent processes. Falls back to platform default. */
  launcher?: SelectLauncherOptions;
  /** Default agent version to launch. Defaults to latest. */
  defaultAgentVersion?: string;
}

interface RegisteredAgent {
  materialization: AgentMaterialization;
  handle?: AgentHandle;
}

/**
 * RealBackend — orchestrates real @medplum/agent processes against a running
 * medplum/server.
 *
 * v0 wiring:
 *   - registerAgent: stored in-memory (FHIR upsert via MedplumClient is a
 *     follow-up; the harness assumes resources already exist on the server,
 *     or that the caller upserts them via their own client).
 *   - startAgent: delegates to AgentLauncher.spawn(). On Linux/macOS dev this
 *     is SourceAgentLauncher (or BinaryAgentLauncher); on Windows it's
 *     WindowsInstallerAgentLauncher.
 *   - upgradeAgent: stop → swap version → start. The Windows installer's
 *     own upgrade path is used when going through the service.
 *   - simulateServerUpgrade: not feasible to bounce a real server from inside
 *     the harness. v0 throws so it's loud rather than silently no-op'd; users
 *     should run the bounce out-of-band (docker compose restart, etc.) and
 *     the harness will observe agents reconnecting through scenario events.
 */
export class RealBackend implements Backend {
  readonly kind = 'real' as const;
  readonly options: RealBackendOptions;
  private launcher: AgentLauncher;
  private agents = new Map<string, RegisteredAgent>();
  private emit: (e: ScenarioEvent) => void = () => undefined;
  private startedAtMs = 0;

  constructor(options: RealBackendOptions) {
    this.options = options;
    this.launcher = createLauncher(options.launcher ?? {});
  }

  async init(_scenario: ScenarioSpec, emit: (e: ScenarioEvent) => void): Promise<void> {
    this.emit = emit;
    this.startedAtMs = Date.now();
    await this.launcher.prepare(this.options.defaultAgentVersion);
    this.recordEvent('backend.ready', { launcher: this.launcher.kind });
  }

  async shutdown(): Promise<void> {
    for (const [nodeId, agent] of this.agents) {
      if (agent.handle) {
        await agent.handle.stop().catch(() => undefined);
        this.recordEvent('agent.stopped', { nodeId });
      }
    }
    this.agents.clear();
  }

  async registerAgent(nodeId: string, materialization: AgentMaterialization): Promise<void> {
    this.agents.set(nodeId, { materialization });
    this.recordEvent('agent.registered', { nodeId });
  }

  async startAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (agent.handle) return; // idempotent
    const creds = this.options.agentCredentials?.[nodeId] ?? {
      clientId: this.options.clientId,
      clientSecret: this.options.clientSecret,
    };
    const agentResourceId = agent.materialization.agent.id;
    if (!agentResourceId) {
      throw new Error(`agent[${nodeId}] materialization has no id`);
    }
    agent.handle = await this.launcher.spawn({
      nodeId,
      baseUrl: this.options.baseUrl,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      agentId: agentResourceId,
      version: this.options.defaultAgentVersion,
    });
    await agent.handle.waitUntilRunning();
    this.recordEvent('agent.started', { nodeId, pid: agent.handle.pid, launcher: agent.handle.kind });
  }

  async stopAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (!agent.handle) return;
    await agent.handle.stop();
    agent.handle = undefined;
    this.recordEvent('agent.stopped', { nodeId });
  }

  async reloadAgentConfig(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    if (agent.handle?.reload) {
      await agent.handle.reload();
    } else {
      // Fallback: stop + start. Loses any in-memory state but is reliable.
      await this.stopAgent(nodeId);
      await this.startAgent(nodeId);
    }
    this.recordEvent('agent.reload-config', { nodeId });
  }

  async upgradeAgent(nodeId: string, version: string): Promise<void> {
    await this.stopAgent(nodeId);
    await this.launcher.prepare(version);
    // Inject the requested version on next spawn by overriding default.
    const oldDefault = this.options.defaultAgentVersion;
    this.options.defaultAgentVersion = version;
    try {
      await this.startAgent(nodeId);
    } finally {
      this.options.defaultAgentVersion = oldDefault;
    }
    this.recordEvent('agent.upgrade', { nodeId, version });
  }

  async simulateServerUpgrade(_opts: { downtimeMs: number }): Promise<void> {
    throw new Error(
      'RealBackend.simulateServerUpgrade is not supported — bounce the medplum/server out-of-band (e.g. docker compose restart server) and the harness will observe agent reconnects.'
    );
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

  private getAgent(nodeId: string): RegisteredAgent {
    const a = this.agents.get(nodeId);
    if (!a) throw new Error(`agent[${nodeId}] not registered with backend`);
    return a;
  }

  private recordEvent(type: string, data?: unknown): void {
    this.emit({ atMs: Date.now() - this.startedAtMs, type, data });
  }
}

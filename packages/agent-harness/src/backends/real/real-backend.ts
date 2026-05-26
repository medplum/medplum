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
  /**
   * Hooks for driving the medplum/server process from inside a scenario. The
   * harness can't bounce a remote server on its own, so callers wire these to
   * whatever they use to run the server (docker compose, systemctl, a child
   * process they own, etc.). Each hook is optional; if absent the matching
   * scenario command throws.
   */
  serverControl?: {
    /** Restart the server. Should resolve once the server is up and accepting connections again. */
    restart?: (opts: { downtimeMs: number; graceful: boolean }) => Promise<void>;
    /** Trigger an upgrade-style bounce (graceful close). Falls back to restart if absent. */
    upgrade?: (opts: { downtimeMs: number }) => Promise<void>;
  };
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
 *   - simulateServerUpgrade / simulateServerRestart: the harness can't bounce
 *     a real server on its own, so callers pass `serverControl.restart` (and
 *     optionally `.upgrade`) callbacks wired to their runtime — docker compose
 *     restart, systemctl, a managed child process, etc. Without those hooks
 *     these commands throw so it's loud rather than silently no-op'd.
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

  async simulateServerUpgrade(opts: { downtimeMs: number }): Promise<void> {
    const hook = this.options.serverControl?.upgrade ?? this.upgradeViaRestart();
    if (!hook) {
      throw new Error(
        'RealBackend.simulateServerUpgrade requires options.serverControl.upgrade (or .restart) — wire it to your medplum/server runtime (docker compose, systemctl, etc.).'
      );
    }
    this.recordEvent('server.upgrade.start', { downtimeMs: opts.downtimeMs });
    await hook(opts);
    this.recordEvent('server.upgrade.end');
  }

  async simulateServerRestart(opts: { downtimeMs: number; graceful?: boolean }): Promise<void> {
    const hook = this.options.serverControl?.restart;
    if (!hook) {
      throw new Error(
        'RealBackend.simulateServerRestart requires options.serverControl.restart — wire it to your medplum/server runtime (docker compose restart, systemctl restart, ChildProcess.kill+respawn, etc.).'
      );
    }
    const graceful = opts.graceful === true;
    this.recordEvent('server.restart.start', { downtimeMs: opts.downtimeMs, graceful });
    await hook({ downtimeMs: opts.downtimeMs, graceful });
    this.recordEvent('server.restart.end');
  }

  private upgradeViaRestart(): ((opts: { downtimeMs: number }) => Promise<void>) | undefined {
    const restart = this.options.serverControl?.restart;
    if (!restart) return undefined;
    return ({ downtimeMs }) => restart({ downtimeMs, graceful: true });
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

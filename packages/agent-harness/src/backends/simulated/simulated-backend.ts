// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentMaterialization, ScenarioEvent, ScenarioSpec } from '../../types';
import type { Backend } from '../backend';

interface RegisteredAgent {
  materialization: AgentMaterialization;
  /** Lightweight stand-in for a real agent process — represents whether the agent has "connected". */
  running: boolean;
  socket?: WebSocket;
}

/**
 * v0 simulated backend.
 *
 * Hosts a fake WS server on an ephemeral port. Doesn't actually spawn the
 * @medplum/agent binary in v0 — instead, agent presence is modeled in-memory.
 * That's enough to exercise scenario lifecycle, the HL7 dataplane (peers talk
 * to each other directly via the materialized Endpoint ports), and
 * `simulate-server-upgrade` semantics. Real agent-process spawning is a
 * follow-up; the interface accommodates it without changing.
 */
export class SimulatedBackend implements Backend {
  readonly kind = 'simulated' as const;
  private wsServer?: WebSocketServer;
  private httpServer?: HttpServer;
  private boundPort?: number;
  private emit: (e: ScenarioEvent) => void = () => undefined;
  private startedAtMs = 0;
  private agents = new Map<string, RegisteredAgent>();
  private acceptingConnections = true;

  async init(_scenario: ScenarioSpec, emit: (e: ScenarioEvent) => void): Promise<void> {
    this.emit = emit;
    this.startedAtMs = Date.now();
    this.httpServer = createServer();
    this.wsServer = new WebSocketServer({ server: this.httpServer });
    this.wsServer.on('connection', (socket) => {
      if (!this.acceptingConnections) {
        socket.close(1013, 'server upgrading');
        return;
      }
      // In v0 we don't bind sockets to specific agent ids — they're tracked
      // collectively so simulate-server-upgrade can drop them all atomically.
      socket.on('close', () => this.recordEvent('agent.ws.closed'));
      this.recordEvent('agent.ws.opened');
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.listen(0, '127.0.0.1', () => {
        const addr = this.httpServer?.address();
        if (addr && typeof addr === 'object') {
          this.boundPort = addr.port;
          resolve();
        } else {
          reject(new Error('failed to bind simulated backend WS server'));
        }
      });
    });
    this.recordEvent('backend.ready', { port: this.boundPort });
  }

  async shutdown(): Promise<void> {
    this.acceptingConnections = false;
    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => this.wsServer?.close(() => resolve()));
      this.wsServer = undefined;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
      this.httpServer = undefined;
    }
  }

  async registerAgent(nodeId: string, materialization: AgentMaterialization): Promise<void> {
    this.agents.set(nodeId, { materialization, running: false });
    this.recordEvent('agent.registered', { nodeId });
  }

  async startAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    agent.running = true;
    this.recordEvent('agent.started', { nodeId });
  }

  async stopAgent(nodeId: string): Promise<void> {
    const agent = this.getAgent(nodeId);
    agent.running = false;
    agent.socket?.close();
    this.recordEvent('agent.stopped', { nodeId });
  }

  async reloadAgentConfig(nodeId: string): Promise<void> {
    this.recordEvent('agent.reload-config', { nodeId });
  }

  async upgradeAgent(nodeId: string, version: string): Promise<void> {
    this.recordEvent('agent.upgrade', { nodeId, version });
  }

  async simulateServerUpgrade({ downtimeMs }: { downtimeMs: number }): Promise<void> {
    this.recordEvent('server.upgrade.start', { downtimeMs });
    this.acceptingConnections = false;
    if (this.wsServer) {
      for (const client of this.wsServer.clients) {
        // 1012 = service restart
        client.close(1012, 'server upgrading');
      }
    }
    await sleep(downtimeMs);
    this.acceptingConnections = true;
    this.recordEvent('server.upgrade.end');
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

  getBoundPort(): number | undefined {
    return this.boundPort;
  }

  private getAgent(nodeId: string): RegisteredAgent {
    const agent = this.agents.get(nodeId);
    if (!agent) {
      throw new Error(`agent[${nodeId}] not registered with backend`);
    }
    return agent;
  }

  private recordEvent(type: string, data?: unknown): void {
    this.emit({ atMs: Date.now() - this.startedAtMs, type, data });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

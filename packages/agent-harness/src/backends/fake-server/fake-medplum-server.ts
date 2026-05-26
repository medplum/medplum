// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentConnectRequest,
  AgentConnectResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentMessage,
  AgentTransmitRequest,
  AgentTransmitResponse,
} from '@medplum/core';
import type { Agent, Endpoint } from '@medplum/fhirtypes';
import express, { type Express, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentMaterialization, ForwardingRule, ScenarioEvent } from '../../types';

/**
 * Version string handed back to agents in heartbeat responses. The real
 * server returns its own build version; for the fake we just pin a marker
 * so tests can assert against it.
 */
const FAKE_SERVER_VERSION = 'fake-medplum-server';

interface ConnectedAgent {
  socket: WebSocket;
  agentId: string;
  /** Pending transmit responses keyed by callback id. */
  pendingTransmits: Map<string, (resp: AgentTransmitResponse) => void>;
}

export interface FakeMedplumServerOptions {
  /**
   * Hook invoked when an agent sends an `agent:transmit:response`. Used by the
   * harness to surface ACKs into the scenario event stream when the harness
   * (not a Bot) initiated the transmit.
   */
  onTransmitResponse?: (agentId: string, resp: AgentTransmitResponse) => void;
  /**
   * ACK body returned to inbound `agent:transmit:request` messages that match
   * no forwarding rule. Defaults to a minimal HL7v2 AA ACK so MLLP sources
   * don't hang.
   */
  defaultAckBody?: string;
  /**
   * If true, inbound `agent:transmit:request` with no matching forwarding rule
   * is rejected with statusCode 400 instead of synthesizing an ACK. Useful in
   * strict scenarios that want to assert every flow is explicitly routed.
   */
  rejectUnroutedTransmits?: boolean;
  /** How long to wait for a downstream agent's response before failing forward. */
  forwardTimeoutMs?: number;
}

const DEFAULT_AA_ACK = 'MSH|^~\\&|HARNESS|FAKE|FAKE|FAKE|20260101000000||ACK||P|2.5.1\rMSA|AA|1';

/**
 * In-process stand-in for medplum/server, just enough that a real
 * @medplum/agent process can connect, complete its handshake, fetch its
 * config, heartbeat, and exchange transmit messages.
 *
 * What it implements:
 *   - POST /oauth2/token   → static bearer token
 *   - GET  /fhir/R4/Agent/{id}    → in-memory registry
 *   - GET  /fhir/R4/Endpoint/{id} → in-memory registry
 *   - WS   /ws/agent
 *       ← agent:connect:request   → reply agent:connect:response
 *       ← agent:heartbeat:request → reply agent:heartbeat:response { version }
 *       → push agent:transmit:request  (server-initiated, via pushTransmit())
 *       ← agent:transmit:response  → routed back via callback or onTransmitResponse hook
 *
 * What it does NOT implement (yet):
 *   - Bot execution. Templates that wire a Bot as the channel target are
 *     accepted but the bot logic is not run; use pushTransmit() from the
 *     harness if you need to drive a transmit at the target agent.
 *   - FHIR search, write, history, batch, $push, anything outside the two
 *     reads above.
 *   - Token verification — any non-empty access token is accepted.
 */
export class FakeMedplumServer {
  private app: Express;
  private httpServer?: HttpServer;
  private wsServer?: WebSocketServer;
  private boundPort?: number;
  private acceptingConnections = true;
  private agents = new Map<string, AgentMaterialization>();
  private connections = new Map<string, ConnectedAgent>();
  private forwardingRules: ForwardingRule[] = [];
  private emit: (e: ScenarioEvent) => void = () => undefined;
  private startedAtMs = 0;
  private readonly options: FakeMedplumServerOptions;

  constructor(options: FakeMedplumServerOptions = {}) {
    this.options = options;
    this.app = express();
    this.app.use(express.json({ limit: '5mb' }));
    this.app.use(express.urlencoded({ extended: false }));
    this.registerRoutes();
  }

  async start(emit: (e: ScenarioEvent) => void): Promise<{ port: number; baseUrl: string }> {
    this.emit = emit;
    this.startedAtMs = Date.now();
    this.httpServer = createServer(this.app);
    this.wsServer = new WebSocketServer({ noServer: true });
    this.httpServer.on('upgrade', (req, socket, head) => {
      if (req.url !== '/ws/agent') {
        socket.destroy();
        return;
      }
      if (!this.acceptingConnections) {
        // 503-style close — tell the agent the server isn't ready.
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wsServer?.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws));
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.listen(0, '127.0.0.1', () => {
        const addr = this.httpServer?.address();
        if (addr && typeof addr === 'object') {
          this.boundPort = addr.port;
          resolve();
        } else {
          reject(new Error('failed to bind fake medplum server'));
        }
      });
    });
    const baseUrl = `http://127.0.0.1:${this.boundPort}/`;
    this.record('fake-server.ready', { port: this.boundPort, baseUrl });
    return { port: this.boundPort as number, baseUrl };
  }

  async stop(): Promise<void> {
    this.acceptingConnections = false;
    for (const conn of this.connections.values()) {
      conn.socket.terminate();
    }
    this.connections.clear();
    if (this.wsServer) {
      await new Promise<void>((resolve) => this.wsServer?.close(() => resolve()));
      this.wsServer = undefined;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
      this.httpServer = undefined;
    }
  }

  registerAgent(materialization: AgentMaterialization): void {
    const id = materialization.agent.id;
    if (!id) throw new Error('cannot register agent materialization without an id');
    this.agents.set(id, materialization);
    if (materialization.forwardingRules?.length) {
      this.addForwardingRules(materialization.forwardingRules);
    }
  }

  addForwardingRules(rules: ForwardingRule[]): void {
    this.forwardingRules.push(...rules);
  }

  setForwardingRules(rules: ForwardingRule[]): void {
    this.forwardingRules = [...rules];
  }

  getForwardingRules(): readonly ForwardingRule[] {
    return this.forwardingRules;
  }

  getBaseUrl(): string {
    if (!this.boundPort) throw new Error('FakeMedplumServer not started');
    return `http://127.0.0.1:${this.boundPort}/`;
  }

  /**
   * Push an `agent:transmit:request` down to a connected agent. Resolves with
   * the agent's response (or rejects on timeout).
   */
  async pushTransmit(
    agentId: string,
    payload: Omit<AgentTransmitRequest, 'type' | 'callback'>,
    opts: { timeoutMs?: number } = {}
  ): Promise<AgentTransmitResponse> {
    const conn = this.connections.get(agentId);
    if (!conn) throw new Error(`agent[${agentId}] is not connected to fake server`);
    const callback = `cb-${Math.random().toString(36).slice(2, 10)}`;
    const message: AgentTransmitRequest = { type: 'agent:transmit:request', callback, ...payload };
    return new Promise<AgentTransmitResponse>((resolve, reject) => {
      const t = setTimeout(() => {
        conn.pendingTransmits.delete(callback);
        reject(new Error(`agent[${agentId}] transmit timed out after ${opts.timeoutMs ?? 10_000}ms`));
      }, opts.timeoutMs ?? 10_000);
      t.unref?.();
      conn.pendingTransmits.set(callback, (resp) => {
        clearTimeout(t);
        resolve(resp);
      });
      conn.socket.send(JSON.stringify(message));
    });
  }

  private async handleInboundTransmit(
    fromAgentId: string,
    socket: WebSocket,
    req: AgentTransmitRequest
  ): Promise<void> {
    const channel = req.channel;
    const rule = this.forwardingRules.find(
      (r) => r.fromAgentId === fromAgentId && (channel === undefined || r.fromChannel === channel)
    );
    if (rule) {
      this.record('forwarding.matched', {
        fromAgentId,
        fromChannel: channel,
        toAgentId: rule.toAgentId,
        toChannel: rule.toChannel,
      });
      const toRemote = rule.toRemote ?? this.resolveAgentChannelRemote(rule.toAgentId, rule.toChannel);
      const downstream = await this.pushTransmit(
        rule.toAgentId,
        {
          channel: rule.toChannel,
          remote: toRemote,
          contentType: req.contentType,
          body: req.body,
        },
        { timeoutMs: this.options.forwardTimeoutMs ?? 10_000 }
      );
      // Chain the downstream ACK back as the upstream response, preserving
      // the original transmit's callback so the source agent can correlate.
      const resp: AgentTransmitResponse = {
        type: 'agent:transmit:response',
        callback: req.callback,
        channel,
        remote: req.remote,
        contentType: req.contentType,
        statusCode: downstream.statusCode ?? 200,
        body: downstream.body,
      };
      socket.send(JSON.stringify(resp));
      return;
    }

    if (this.options.rejectUnroutedTransmits) {
      const errResp: AgentTransmitResponse = {
        type: 'agent:transmit:response',
        callback: req.callback,
        channel,
        remote: req.remote,
        contentType: req.contentType,
        statusCode: 400,
        body: `no forwarding rule for agent ${fromAgentId} channel ${channel ?? '(none)'}`,
      };
      socket.send(JSON.stringify(errResp));
      this.record('forwarding.unrouted-rejected', { fromAgentId, channel });
      return;
    }

    const ackResp: AgentTransmitResponse = {
      type: 'agent:transmit:response',
      callback: req.callback,
      channel,
      remote: req.remote,
      contentType: req.contentType,
      statusCode: 200,
      body: this.options.defaultAckBody ?? DEFAULT_AA_ACK,
    };
    socket.send(JSON.stringify(ackResp));
    this.record('forwarding.default-ack', { fromAgentId, channel });
  }

  private resolveAgentChannelRemote(agentId: string, channelName: string): string {
    const mat = this.agents.get(agentId);
    if (!mat) {
      throw new Error(`forwarding target agent[${agentId}] is not registered with fake server`);
    }
    const channel = mat.agent.channel?.find((c) => c.name === channelName);
    if (!channel) {
      throw new Error(`forwarding target agent[${agentId}] has no channel '${channelName}'`);
    }
    const endpointId = channel.endpoint?.reference?.split('/')[1];
    const endpoint = mat.endpoints.find((e) => e.id === endpointId);
    if (!endpoint?.address) {
      throw new Error(`forwarding target agent[${agentId}] channel '${channelName}' has no address`);
    }
    return endpoint.address;
  }

  async simulateServerUpgrade({ downtimeMs }: { downtimeMs: number }): Promise<void> {
    this.record('server.upgrade.start', { downtimeMs });
    this.acceptingConnections = false;
    for (const conn of this.connections.values()) {
      conn.socket.close(1012, 'server upgrading');
    }
    await sleep(downtimeMs);
    this.acceptingConnections = true;
    this.record('server.upgrade.end');
  }

  async simulateServerRestart({ downtimeMs, graceful }: { downtimeMs: number; graceful?: boolean }): Promise<void> {
    this.record('server.restart.start', { downtimeMs, graceful: graceful === true });
    this.acceptingConnections = false;
    for (const conn of this.connections.values()) {
      if (graceful) {
        conn.socket.close(1012, 'server restarting');
      } else {
        conn.socket.terminate();
      }
    }
    await sleep(downtimeMs);
    this.acceptingConnections = true;
    this.record('server.restart.end');
  }

  /** Test hook: list ids of currently connected agents. */
  getConnectedAgentIds(): string[] {
    return [...this.connections.keys()];
  }

  private registerRoutes(): void {
    this.app.post('/oauth2/token', (_req: Request, res: Response) => {
      res.json({
        access_token: 'fake-token-' + Math.random().toString(36).slice(2),
        token_type: 'Bearer',
        expires_in: 3600,
      });
    });

    this.app.get('/fhir/R4/Agent/:id', (req: Request, res: Response) => {
      const id = String(req.params.id);
      const mat = this.agents.get(id);
      if (!mat) {
        res.status(404).json(notFoundOutcome('Agent', id));
        return;
      }
      res.json(mat.agent satisfies Agent);
    });

    this.app.get('/fhir/R4/Endpoint/:id', (req: Request, res: Response) => {
      const id = String(req.params.id);
      for (const mat of this.agents.values()) {
        const ep = mat.endpoints.find((e) => e.id === id);
        if (ep) {
          res.json(ep satisfies Endpoint);
          return;
        }
      }
      res.status(404).json(notFoundOutcome('Endpoint', id));
    });

    // Catch-all 404 helps surface unexpected agent requests in tests.
    this.app.use((req: Request, res: Response) => {
      this.record('fake-server.unhandled-request', { method: req.method, path: req.path });
      res.status(404).json(notFoundOutcome('Resource', req.path));
    });
  }

  private handleConnection(socket: WebSocket): void {
    this.record('agent.ws.opened');
    let connectedAgentId: string | undefined;

    socket.on('message', (raw) => {
      let msg: AgentMessage;
      try {
        msg = JSON.parse(raw.toString()) as AgentMessage;
      } catch (err) {
        this.record('agent.ws.bad-json', { error: (err as Error).message });
        return;
      }
      switch (msg.type) {
        case 'agent:connect:request': {
          const req = msg as AgentConnectRequest;
          connectedAgentId = req.agentId;
          this.connections.set(req.agentId, {
            socket,
            agentId: req.agentId,
            pendingTransmits: new Map(),
          });
          const resp: AgentConnectResponse = { type: 'agent:connect:response', callback: msg.callback };
          socket.send(JSON.stringify(resp));
          this.record('agent.ws.connected', { agentId: req.agentId });
          break;
        }
        case 'agent:heartbeat:request': {
          const req = msg as AgentHeartbeatRequest;
          const resp: AgentHeartbeatResponse = {
            type: 'agent:heartbeat:response',
            callback: req.callback,
            version: FAKE_SERVER_VERSION,
          };
          socket.send(JSON.stringify(resp));
          break;
        }
        case 'agent:transmit:request': {
          if (!connectedAgentId) {
            this.record('agent.ws.transmit-without-connect');
            return;
          }
          const req = msg as AgentTransmitRequest;
          // Don't block the read loop on a forwarding round-trip.
          void this.handleInboundTransmit(connectedAgentId, socket, req).catch((err) => {
            this.record('forwarding.error', {
              fromAgentId: connectedAgentId,
              error: (err as Error).message,
            });
            const errResp: AgentTransmitResponse = {
              type: 'agent:transmit:response',
              callback: req.callback,
              channel: req.channel,
              remote: req.remote,
              contentType: req.contentType,
              statusCode: 500,
              body: `forwarding error: ${(err as Error).message}`,
            };
            socket.send(JSON.stringify(errResp));
          });
          break;
        }
        case 'agent:transmit:response': {
          const resp = msg as AgentTransmitResponse;
          if (connectedAgentId) {
            const conn = this.connections.get(connectedAgentId);
            if (resp.callback && conn?.pendingTransmits.has(resp.callback)) {
              const cb = conn.pendingTransmits.get(resp.callback);
              conn.pendingTransmits.delete(resp.callback);
              cb?.(resp);
            }
            this.options.onTransmitResponse?.(connectedAgentId, resp);
            this.record('agent.transmit.response', {
              agentId: connectedAgentId,
              statusCode: resp.statusCode,
              channel: resp.channel,
            });
          }
          break;
        }
        default:
          this.record('agent.ws.message.ignored', { type: msg.type });
      }
    });

    socket.on('close', (code, reason) => {
      if (connectedAgentId) {
        this.connections.delete(connectedAgentId);
      }
      this.record('agent.ws.closed', { agentId: connectedAgentId, code, reason: reason.toString() });
    });

    socket.on('error', (err) => {
      this.record('agent.ws.error', { agentId: connectedAgentId, error: err.message });
    });
  }

  private record(type: string, data?: unknown): void {
    this.emit({ atMs: Date.now() - this.startedAtMs, type, data });
  }
}

function notFoundOutcome(resourceType: string, id: string): object {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'not-found',
        details: { text: `${resourceType}/${id} not found in fake medplum server` },
      },
    ],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

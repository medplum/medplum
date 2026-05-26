// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AgentConnectRequest,
  AgentConnectResponse,
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentTransmitResponse,
} from '@medplum/core';
import WebSocket from 'ws';
import type { ScenarioEvent } from '../../types';
import { FakeMedplumServer } from './fake-medplum-server';

/**
 * Exercises FakeMedplumServer end-to-end with a raw ws client driving the
 * agent protocol. Keeps the test deterministic and fast (no real @medplum/agent
 * process needed); the HybridBackend integration with a real process is
 * covered separately by manual smoke + launcher tests.
 */
describe('FakeMedplumServer', () => {
  let server: FakeMedplumServer;
  let events: ScenarioEvent[];
  let baseUrl: string;

  beforeEach(async () => {
    events = [];
    server = new FakeMedplumServer();
    const started = await server.start((e) => events.push(e));
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('serves oauth2 tokens and FHIR Agent + Endpoint reads', async () => {
    server.registerAgent({
      agent: {
        resourceType: 'Agent',
        id: 'agent-1',
        name: 'agent-1',
        status: 'active',
        channel: [
          {
            name: 'hl7-in',
            endpoint: { reference: 'Endpoint/ep-1' },
            targetReference: { reference: 'Bot/bot-1' },
          },
        ],
      },
      endpoints: [
        {
          resourceType: 'Endpoint',
          id: 'ep-1',
          status: 'active',
          connectionType: { code: 'hl7v2-mllp' },
          payloadType: [{ coding: [{ code: 'any' }] }],
          address: 'mllp://0.0.0.0:9001',
        },
      ],
    });

    const tokenResp = await fetch(`${baseUrl}oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=h&client_secret=h',
    });
    expect(tokenResp.status).toBe(200);
    const token = (await tokenResp.json()) as { access_token: string; token_type: string };
    expect(token.access_token).toMatch(/^fake-token-/);
    expect(token.token_type).toBe('Bearer');

    const agentResp = await fetch(`${baseUrl}fhir/R4/Agent/agent-1`);
    expect(agentResp.status).toBe(200);
    const agentJson = (await agentResp.json()) as { resourceType: string; id: string };
    expect(agentJson.resourceType).toBe('Agent');
    expect(agentJson.id).toBe('agent-1');

    const epResp = await fetch(`${baseUrl}fhir/R4/Endpoint/ep-1`);
    expect(epResp.status).toBe(200);
    const epJson = (await epResp.json()) as { resourceType: string; id: string };
    expect(epJson.resourceType).toBe('Endpoint');

    const missing = await fetch(`${baseUrl}fhir/R4/Agent/does-not-exist`);
    expect(missing.status).toBe(404);
  });

  it('completes the WS handshake and heartbeat protocol', async () => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + 'ws/agent';
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    const connectReq: AgentConnectRequest = {
      type: 'agent:connect:request',
      accessToken: 'fake-token-anything',
      agentId: 'agent-handshake',
    };
    const connectResp = await sendAndAwait<AgentConnectResponse>(ws, connectReq, 'agent:connect:response');
    expect(connectResp.type).toBe('agent:connect:response');

    const hbReq: AgentHeartbeatRequest = { type: 'agent:heartbeat:request' };
    const hbResp = await sendAndAwait<AgentHeartbeatResponse>(ws, hbReq, 'agent:heartbeat:response');
    expect(hbResp.type).toBe('agent:heartbeat:response');
    expect(hbResp.version).toBeDefined();

    expect(server.getConnectedAgentIds()).toContain('agent-handshake');

    ws.close();
    await new Promise<void>((r) => ws.once('close', () => r()));
  });

  it('pushTransmit delivers a request and resolves with the agent response', async () => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + 'ws/agent';
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(
      JSON.stringify({ type: 'agent:connect:request', agentId: 'agent-px' } satisfies AgentConnectRequest)
    );
    // Wait for connect response so the connection is registered server-side.
    await waitForMessage(ws, 'agent:connect:response');

    // When the server pushes a transmit, our fake agent echoes back AA.
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { type: string; callback?: string; channel?: string; remote?: string };
      if (msg.type === 'agent:transmit:request') {
        const resp: AgentTransmitResponse = {
          type: 'agent:transmit:response',
          callback: msg.callback,
          channel: msg.channel,
          remote: msg.remote ?? '',
          contentType: 'application/hl7-v2',
          statusCode: 200,
          body: 'MSH|^~\\&|||||||ACK||P|2.5\rMSA|AA|1',
        };
        ws.send(JSON.stringify(resp));
      }
    });

    const resp = await server.pushTransmit(
      'agent-px',
      {
        channel: 'hl7-in',
        remote: 'mllp://127.0.0.1:9999',
        contentType: 'application/hl7-v2',
        body: 'MSH|...',
      },
      { timeoutMs: 2_000 }
    );
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toContain('MSA|AA');

    ws.close();
    await new Promise<void>((r) => ws.once('close', () => r()));
  });

  it('forwards inbound transmits A→B and chains the ACK back to A', async () => {
    // Register both agents (just for resolveAgentChannelRemote on B).
    server.registerAgent({
      agent: {
        resourceType: 'Agent',
        id: 'agent-a',
        name: 'a',
        status: 'active',
        channel: [{ name: 'hl7-in', endpoint: { reference: 'Endpoint/ep-a' } }],
      },
      endpoints: [
        {
          resourceType: 'Endpoint',
          id: 'ep-a',
          status: 'active',
          connectionType: { code: 'hl7v2-mllp' },
          payloadType: [{ coding: [{ code: 'any' }] }],
          address: 'mllp://0.0.0.0:9101',
        },
      ],
    });
    server.registerAgent({
      agent: {
        resourceType: 'Agent',
        id: 'agent-b',
        name: 'b',
        status: 'active',
        channel: [{ name: 'hl7-in', endpoint: { reference: 'Endpoint/ep-b' } }],
      },
      endpoints: [
        {
          resourceType: 'Endpoint',
          id: 'ep-b',
          status: 'active',
          connectionType: { code: 'hl7v2-mllp' },
          payloadType: [{ coding: [{ code: 'any' }] }],
          address: 'mllp://0.0.0.0:9102',
        },
      ],
    });
    server.setForwardingRules([
      { fromAgentId: 'agent-a', fromChannel: 'hl7-in', toAgentId: 'agent-b', toChannel: 'hl7-in' },
    ]);

    const wsUrl = baseUrl.replace(/^http/, 'ws') + 'ws/agent';
    const wsA = new WebSocket(wsUrl);
    const wsB = new WebSocket(wsUrl);
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        wsA.once('open', () => resolve());
        wsA.once('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        wsB.once('open', () => resolve());
        wsB.once('error', reject);
      }),
    ]);

    wsA.send(JSON.stringify({ type: 'agent:connect:request', agentId: 'agent-a' }));
    wsB.send(JSON.stringify({ type: 'agent:connect:request', agentId: 'agent-b' }));
    await Promise.all([waitForMessage(wsA, 'agent:connect:response'), waitForMessage(wsB, 'agent:connect:response')]);

    // B echoes any transmit:request from the server back as AA, while
    // recording the remote it was told to send to (proves the fake server
    // resolved B's outbound address from B's own channel/Endpoint).
    let remoteAtB: string | undefined;
    wsB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { type: string; callback?: string; channel?: string; remote?: string };
      if (msg.type === 'agent:transmit:request') {
        remoteAtB = msg.remote;
        wsB.send(
          JSON.stringify({
            type: 'agent:transmit:response',
            callback: msg.callback,
            channel: msg.channel,
            remote: msg.remote,
            contentType: 'application/hl7-v2',
            statusCode: 200,
            body: 'MSH|^~\\&|||||||ACK||P|2.5\rMSA|AA|B-ACK',
          })
        );
      }
    });

    // A sends an inbound transmit:request to the server (modeling the agent's
    // inbound MLLP path) and waits for the server's response.
    const upstreamCallback = 'cb-up-1';
    wsA.send(
      JSON.stringify({
        type: 'agent:transmit:request',
        callback: upstreamCallback,
        channel: 'hl7-in',
        remote: 'mllp://upstream-source:9100',
        contentType: 'application/hl7-v2',
        body: 'MSH|^~\\&|SOURCE||||||ADT^A01|UP-1|P|2.5',
      })
    );
    const upstreamResp = await waitForMessage<{
      type: string;
      callback?: string;
      statusCode?: number;
      body: string;
    }>(wsA, 'agent:transmit:response');

    expect(upstreamResp.callback).toBe(upstreamCallback);
    expect(upstreamResp.statusCode).toBe(200);
    expect(upstreamResp.body).toContain('MSA|AA|B-ACK');
    expect(remoteAtB).toBe('mllp://0.0.0.0:9102');

    const types = events.map((e) => e.type);
    expect(types).toContain('forwarding.matched');

    wsA.close();
    wsB.close();
    await Promise.all([
      new Promise<void>((r) => wsA.once('close', () => r())),
      new Promise<void>((r) => wsB.once('close', () => r())),
    ]);
  });

  it('synthesizes a default AA ACK when no forwarding rule matches', async () => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + 'ws/agent';
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'agent:connect:request', agentId: 'agent-orphan' }));
    await waitForMessage(ws, 'agent:connect:response');

    ws.send(
      JSON.stringify({
        type: 'agent:transmit:request',
        callback: 'cb-orphan',
        channel: 'hl7-in',
        remote: 'mllp://nope:9999',
        contentType: 'application/hl7-v2',
        body: 'MSH|^~\\&|...',
      })
    );
    const resp = await waitForMessage<{ statusCode?: number; body: string; callback?: string }>(
      ws,
      'agent:transmit:response'
    );
    expect(resp.callback).toBe('cb-orphan');
    expect(resp.statusCode).toBe(200);
    expect(resp.body).toContain('MSA|AA');

    ws.close();
    await new Promise<void>((r) => ws.once('close', () => r()));
  });

  it('simulateServerRestart abruptly terminates connections and re-accepts after downtime', async () => {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + 'ws/agent';
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'agent:connect:request', agentId: 'agent-r' } satisfies AgentConnectRequest));
    await waitForMessage(ws, 'agent:connect:response');

    const closed = new Promise<{ code: number }>((resolve) => {
      ws.once('close', (code) => resolve({ code }));
    });

    await server.simulateServerRestart({ downtimeMs: 50 });
    await closed;

    expect(server.getConnectedAgentIds()).not.toContain('agent-r');

    const types = events.map((e) => e.type);
    expect(types).toContain('server.restart.start');
    expect(types).toContain('server.restart.end');

    // After the downtime window, new connections succeed again.
    const ws2 = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws2.once('open', () => resolve());
      ws2.once('error', reject);
    });
    ws2.close();
    await new Promise<void>((r) => ws2.once('close', () => r()));
  });
});

function sendAndAwait<TResp>(ws: WebSocket, msg: unknown, expectType: string): Promise<TResp> {
  ws.send(JSON.stringify(msg));
  return waitForMessage<TResp>(ws, expectType);
}

function waitForMessage<TResp>(ws: WebSocket, expectType: string): Promise<TResp> {
  return new Promise<TResp>((resolve, reject) => {
    const t = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`timed out waiting for ${expectType}`));
    }, 2_000);
    t.unref?.();
    const onMessage = (raw: WebSocket.RawData): void => {
      const parsed = JSON.parse(raw.toString()) as { type: string };
      if (parsed.type === expectType) {
        clearTimeout(t);
        ws.off('message', onMessage);
        resolve(parsed as TResp);
      }
    };
    ws.on('message', onMessage);
  });
}

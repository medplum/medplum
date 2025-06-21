import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';
import { Server } from 'http';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

describe('MCP Routes', () => {
  const app = express();
  let accessToken: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine server address');
    }
    port = address.port;
  });

  afterAll(async () => {
    await shutdownApp();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('Unauthenticated streamable HTTP', async () => {
    const res = await request(app).get('/mcp/stream');
    expect(res.status).toBe(401);
  });

  test('Unauthenticated SSE', async () => {
    const res = await request(app).get('/mcp/sse');
    expect(res.status).toBe(401);
  });

  test('Streamable HTTP session not found', async () => {
    const res = await request(app)
      .post('/mcp/stream')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(400);
    expect(res.text).toStrictEqual(
      '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: No valid session ID provided"},"id":null}'
    );
  });

  test('SSE POST to non-existent session ID should return 400', async () => {
    const res = await request(app)
      .post('/mcp/sse')
      .query({ sessionId: 'non-existent-session' })
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/json')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(400);
    expect(res.text).toBe('No transport found for sessionId');
  });

  test('Use SSEClientTransport', async () => {
    const sseBaseUrl = `http://localhost:${port}/mcp/sse`;
    const receivedMessages: any[] = [];

    const transport = new SSEClientTransport(new URL(sseBaseUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    transport.onmessage = (msg) => receivedMessages.push(msg);

    const client = new Client({
      name: 'example-client',
      version: '1.0.0',
    });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools).toBeDefined();

    const searchResult = await client.callTool({
      name: 'search',
      arguments: {
        query: 'example',
      },
    });
    expect(searchResult).toBeDefined();

    const fetchResult = await client.callTool({
      name: 'fetch',
      arguments: {
        id: 'example-id',
      },
    });
    expect(fetchResult).toBeDefined();

    const fhirRequestResult = await client.callTool({
      name: 'fhir-request',
      arguments: {
        method: 'GET',
        path: 'Patient',
      },
    });
    expect(fhirRequestResult).toBeDefined();

    await client.close();
  });

  test('Use StreamableHTTPClientTransport', async () => {
    const streamableBaseUrl = `http://localhost:${port}/mcp/stream`;
    const receivedMessages: any[] = [];

    const transport = new StreamableHTTPClientTransport(new URL(streamableBaseUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    transport.onmessage = (msg) => receivedMessages.push(msg);

    const client = new Client({
      name: 'example-client',
      version: '1.0.0',
    });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools).toBeDefined();

    const searchResult = await client.callTool({
      name: 'search',
      arguments: {
        query: 'example',
      },
    });
    expect(searchResult).toBeDefined();

    const fetchResult = await client.callTool({
      name: 'fetch',
      arguments: {
        id: 'example-id',
      },
    });
    expect(fetchResult).toBeDefined();

    const fhirRequestResult = await client.callTool({
      name: 'fhir-request',
      arguments: {
        method: 'GET',
        path: 'Patient',
      },
    });
    expect(fhirRequestResult).toBeDefined();

    await client.close();
  });
});

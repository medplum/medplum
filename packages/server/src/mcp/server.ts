// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  concatUrls,
  DEFAULT_SEARCH_COUNT,
  getDisplayString,
  getReferenceString,
  isString,
  MEDPLUM_VERSION,
  MedplumClient,
  normalizeOperationOutcome,
  OperationOutcomeError,
  parseReference,
  parseSearchRequest,
} from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { getFullUrl } from '../fhir/response';
import { getLogger } from '../logger';

const MCP_MAX_SEARCH_COUNT = 100;
const MCP_MAX_TITLE_LENGTH = 200;
const MCP_MAX_FETCH_LENGTH = 50_000;

interface McpSearchResult {
  id: string;
  title: string;
  url: string;
}

interface McpSearchResponse extends Record<string, unknown> {
  results: McpSearchResult[];
  total?: number;
}

interface McpFetchResponse extends Record<string, unknown> {
  id: string;
  title: string;
  text: string;
  url: string;
}

function withJsonContent<T extends object>(
  structuredContent: T
): {
  content: [{ type: 'text'; text: string }];
  structuredContent: T;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function clampMcpSearchCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count) || count < 0) {
    return DEFAULT_SEARCH_COUNT;
  }
  return Math.min(count, MCP_MAX_SEARCH_COUNT);
}

function getMcpTitle(resource: WithId<Resource>): string {
  const reference = getReferenceString(resource);
  const title = getDisplayString(resource) || reference;
  return title.length > MCP_MAX_TITLE_LENGTH ? `${title.slice(0, MCP_MAX_TITLE_LENGTH - 3)}...` : title;
}

function toMcpSearchResult(resource: WithId<Resource>): McpSearchResult {
  const id = getReferenceString(resource);
  return {
    id,
    title: getMcpTitle(resource),
    url: getFullUrl(resource.resourceType, resource.id),
  };
}

function toMcpFetchResponse(resource: WithId<Resource>): McpFetchResponse {
  const id = getReferenceString(resource);
  const json = JSON.stringify(resource);

  return {
    id,
    title: getMcpTitle(resource),
    text:
      json.length > MCP_MAX_FETCH_LENGTH
        ? `${json.slice(0, MCP_MAX_FETCH_LENGTH)}... [truncated ${json.length} character resource]`
        : json,
    url: getFullUrl(resource.resourceType, resource.id),
  };
}

function withOperationOutcome(err: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(normalizeOperationOutcome(err)) }],
    isError: true,
  };
}

export function getMcpServer(): McpServer {
  const server = new McpServer({
    name: 'medplum',
    version: MEDPLUM_VERSION,
  });

  server.registerTool(
    'search',
    {
      title: 'FHIR Search',
      description:
        'Search FHIR resources using a FHIR search string such as "Patient?name=Smith&_count=10". ' +
        `Returns at most ${MCP_MAX_SEARCH_COUNT} matches (default ${DEFAULT_SEARCH_COUNT}); use _offset to page. ` +
        'Each result id is a FHIR reference that can be passed to fetch. _include and _revinclude are ignored.',
      inputSchema: {
        query: z.string().describe('FHIR search query, for example "Patient?name=Smith&_count=10".'),
      },
      outputSchema: {
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string(),
          })
        ),
        total: z.number().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }): Promise<CallToolResult> => {
      getLogger().debug(`Performing search for: "${query}"`);
      try {
        const resourceType = query.split('?')[0];
        if (!/^[A-Z][A-Za-z0-9]*$/.test(resourceType)) {
          throw new OperationOutcomeError(
            badRequest('Search query must start with a resource type, for example "Patient?name=Smith"')
          );
        }

        const ctx = getAuthenticatedContext();
        const searchRequest = parseSearchRequest(query);
        delete searchRequest.include;
        delete searchRequest.revInclude;
        searchRequest.count = clampMcpSearchCount(searchRequest.count);

        const bundle = await ctx.repo.search(searchRequest);
        const results = (bundle.entry ?? []).flatMap((entry) => {
          const resource = entry.resource;
          if (entry.search?.mode !== 'match' || !resource?.id) {
            return [];
          }
          return [toMcpSearchResult(resource)];
        });
        const response: McpSearchResponse = { results };
        if (bundle.total !== undefined) {
          response.total = bundle.total;
        }
        return withJsonContent(response);
      } catch (err) {
        return withOperationOutcome(err);
      }
    }
  );

  server.registerTool(
    'fetch',
    {
      title: 'FHIR Read',
      description:
        'Fetch one FHIR resource using a reference returned by search, such as "Patient/123". ' +
        'Very large resources are truncated, and Binary resources are not supported.',
      inputSchema: {
        id: z.string().describe('FHIR resource reference returned by search, for example "Patient/123".'),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        text: z.string(),
        url: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }): Promise<CallToolResult> => {
      getLogger().debug(`Performing fetch for ID: "${id}"`);
      try {
        const parts = id.split('/');
        if (parts.length !== 2 || !/^[A-Z][A-Za-z0-9]*$/.test(parts[0]) || !parts[1]) {
          throw new OperationOutcomeError(
            badRequest('The id must be a FHIR reference of the form "ResourceType/id", for example "Patient/123"')
          );
        }
        if (parts[0] === 'Binary') {
          throw new OperationOutcomeError(badRequest('Binary resources are not supported by the fetch tool'));
        }

        const ctx = getAuthenticatedContext();
        const [resourceType, resourceId] = parseReference<Resource>({ reference: id });
        const resource = await ctx.repo.readResource<Resource>(resourceType, resourceId);
        return withJsonContent(toMcpFetchResponse(resource));
      } catch (err) {
        return withOperationOutcome(err);
      }
    }
  );

  // This the main FHIR request tool that allows clients to make FHIR requests to the Medplum server.
  // The current implmentation uses the very suboptimal approach of re-fetching the URL on behalf of the client.
  // Over time, we should definitely replace this with the "FhirRouter" approach, which would stay within the Medplum server and not re-fetch the URL.
  // However, there are a few FHIR endpoints that are not yet available in FhirRouter, so we need to use fetch for now.
  server.registerTool(
    'fhir-request',
    {
      inputSchema: {
        method: z.string(),
        path: z.string(),
        body: z.any(),
      },
    },
    async ({ method, path, body }) => {
      const ctx = getAuthenticatedContext();
      const baseUrl = getConfig().baseUrl;
      const baseFhirUrl = concatUrls(baseUrl, 'fhir/R4');
      const fhirUrl = concatUrls(baseFhirUrl, path);

      // SSRF / token-exfiltration guard (GHSA-fjgc-c3pj-xx2c).
      // concatUrls() is new URL(path, base); an absolute or protocol-absolute `path`
      // discards the base and points the proxy at an attacker-controlled URL. Because
      // the proxy request carries the caller's bearer token, an off-origin URL both
      // performs SSRF and leaks the token. Pin the resolved URL to the server origin.
      if (new URL(fhirUrl).origin !== new URL(baseUrl).origin) {
        throw new Error('Invalid path: must be relative to the FHIR base URL');
      }

      const accessToken = ctx.authState.accessToken;
      const proxy = new MedplumClient({ baseUrl, accessToken, fetch: globalThis.fetch });

      // MCP allows sending JSON, but some clients (like Claude) send the body as a string
      if (isString(body)) {
        body = JSON.parse(body);
      }

      let response: unknown;
      switch (method.toLowerCase()) {
        case 'get':
          response = await proxy.get(fhirUrl);
          break;
        case 'delete':
          response = await proxy.delete(fhirUrl, body);
          break;
        case 'patch':
          response = await proxy.patch(fhirUrl, body);
          break;
        case 'post':
          response = await proxy.post(fhirUrl, body);
          break;
        case 'put':
          response = await proxy.put(fhirUrl, body);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response),
            uri: fhirUrl,
          },
        ],
      };
    }
  );

  return server;
}

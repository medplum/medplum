// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  concatUrls,
  DEFAULT_SEARCH_COUNT,
  getDisplayString,
  getReferenceString,
  isString,
  MEDPLUM_VERSION,
  MedplumClient,
  parseReference,
  parseSearchRequest,
} from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { getFullUrl } from '../fhir/response';
import { getLogger } from '../logger';

const MCP_MAX_SEARCH_COUNT = 100;

interface McpSearchResult {
  id: string;
  title: string;
  url: string;
}

interface McpSearchResponse extends Record<string, unknown> {
  results: McpSearchResult[];
}

interface McpFetchResponse extends Record<string, unknown> {
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

function applyMcpSearchCount(searchRequest: SearchRequest): void {
  if (searchRequest.count === undefined) {
    searchRequest.count = DEFAULT_SEARCH_COUNT;
  } else {
    searchRequest.count = Math.min(Math.max(searchRequest.count, 1), MCP_MAX_SEARCH_COUNT);
  }
}

function toMcpSearchResult(resource: WithId<Resource>): McpSearchResult {
  const id = getReferenceString(resource);
  return {
    id,
    title: getDisplayString(resource) || id,
    url: getFullUrl(resource.resourceType, resource.id),
  };
}

function toMcpFetchResponse(resource: WithId<Resource>): McpFetchResponse {
  const id = getReferenceString(resource);
  const metadata: McpFetchResponse['metadata'] = {
    resourceType: resource.resourceType,
  };

  if (resource.meta?.versionId) {
    metadata.versionId = resource.meta.versionId;
  }
  if (resource.meta?.lastUpdated) {
    metadata.lastUpdated = resource.meta.lastUpdated;
  }

  return {
    id,
    title: getDisplayString(resource) || id,
    text: JSON.stringify(resource),
    url: getFullUrl(resource.resourceType, resource.id),
    metadata,
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
      description: 'Search FHIR resources with a FHIR search query such as "Patient?name=Smith&_count=10".',
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
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query }) => {
      getLogger().debug(`Performing search for: "${query}"`);
      const ctx = getAuthenticatedContext();
      const searchRequest = parseSearchRequest(query);
      applyMcpSearchCount(searchRequest);
      const results = (await ctx.repo.searchResources(searchRequest)).map(toMcpSearchResult);
      return withJsonContent<McpSearchResponse>({ results });
    }
  );

  server.registerTool(
    'fetch',
    {
      description: 'Fetch a single FHIR resource by reference returned from search, such as "Patient/123".',
      inputSchema: {
        id: z.string().describe('FHIR resource reference returned by search, for example "Patient/123".'),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        text: z.string(),
        url: z.string(),
        metadata: z.object({
          resourceType: z.string(),
          versionId: z.string().optional(),
          lastUpdated: z.string().optional(),
        }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      getLogger().debug(`Performing fetch for ID: "${id}"`);
      const ctx = getAuthenticatedContext();
      const [resourceType, resourceId] = parseReference<Resource>({ reference: id });
      const resource = await ctx.repo.readResource<Resource>(resourceType, resourceId);
      return withJsonContent(toMcpFetchResponse(resource));
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

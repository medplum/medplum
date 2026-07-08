// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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

// Search results are intentionally small (id/title/url only) to keep tool output within LLM context limits.
const MCP_MAX_SEARCH_COUNT = 100;

// Titles come from getDisplayString, which can embed arbitrarily long resource content.
const MCP_MAX_TITLE_LENGTH = 200;

// Fetched resources can be arbitrarily large (e.g. inline Attachment data), so the JSON is truncated.
const MCP_MAX_FETCH_LENGTH = 50_000;

/**
 * Clamps the search page size to keep tool output within LLM context limits.
 * @param count - The requested count, if any.
 * @returns The bounded count.
 */
export function clampSearchCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count) || count < 0) {
    return DEFAULT_SEARCH_COUNT;
  }
  return Math.min(count, MCP_MAX_SEARCH_COUNT);
}

export function getMcpServer(): McpServer {
  const server = new McpServer({
    name: 'medplum',
    version: MEDPLUM_VERSION,
  });

  /**
   * ChatGPT requires two standard tools: "search" and "fetch".
   * If these tools are not implemented, ChatGPT will not connect to the Medplum server.
   * The tool names, input schemas, and result shapes follow the OpenAI MCP guide:
   * https://developers.openai.com/api/docs/mcp
   *
   * Both tools are read-only and go through the caller's authenticated repository context,
   * so normal Medplum access-policy checks apply.
   */
  server.registerTool(
    'search',
    {
      title: 'FHIR Search',
      description:
        'Search for FHIR resources using FHIR search syntax. ' +
        'The query must be a FHIR search string starting with a resource type, ' +
        'such as "Patient?name=Smith", "Observation?patient=Patient/123&_sort=-date", or "Practitioner". ' +
        `Returns at most ${MCP_MAX_SEARCH_COUNT} matches per call (default ${DEFAULT_SEARCH_COUNT}); ` +
        'use "_count" and "_offset" to page, and "_total=accurate" to include a "total" match count. ' +
        'Resources joined via "_include"/"_revinclude" are not returned; read them with "fetch". ' +
        'Each result "id" is a FHIR reference that can be passed to the "fetch" tool.',
      inputSchema: {
        query: z.string().describe('FHIR search string, e.g. "Patient?name=Smith&_count=10".'),
      },
      outputSchema: {
        results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string() })),
        total: z.number().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query }): Promise<CallToolResult> => {
      getLogger().debug(`Performing search for: "${query}"`);
      try {
        const ctx = getAuthenticatedContext();
        // This tool accepts resource-type search strings only. Use a patient search parameter
        // instead of a compartment-style path, e.g. "Observation?patient=Patient/123".
        const path = query.split('?')[0];
        if (path.split('/').filter(Boolean).length > 1) {
          throw new OperationOutcomeError(
            badRequest('Search query must start with a resource type, e.g. "Patient?name=Smith"')
          );
        }
        const searchRequest = parseSearchRequest(query);
        // Included resources are not returned by this tool, so skip the work of loading them
        delete searchRequest.include;
        delete searchRequest.revInclude;
        searchRequest.count = clampSearchCount(searchRequest.count);
        const bundle = await ctx.repo.search(searchRequest);
        const results = (bundle.entry ?? []).flatMap((entry) =>
          entry.search?.mode === 'match' && entry.resource
            ? [
                {
                  id: getReferenceString(entry.resource),
                  title: buildTitle(entry.resource),
                  url: getFullUrl(entry.resource.resourceType, entry.resource.id),
                },
              ]
            : []
        );
        const structuredContent: Record<string, unknown> = { results };
        if (bundle.total !== undefined) {
          structuredContent['total'] = bundle.total;
        }
        return buildToolResult(structuredContent);
      } catch (err) {
        return buildErrorResult(err);
      }
    }
  );

  server.registerTool(
    'fetch',
    {
      title: 'FHIR Read',
      description:
        'Read a single FHIR resource by reference. ' +
        'The id must be a FHIR reference of the form "ResourceType/id" (e.g. "Patient/123"), ' +
        'as returned in the "id" field of "search" results. ' +
        'Returns the resource as JSON in the "text" field; very large resources are truncated.',
      inputSchema: {
        id: z.string().describe('The reference of the resource to fetch, obtained from a search result.'),
      },
      outputSchema: {
        id: z.string(),
        title: z.string(),
        text: z.string(),
        url: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }): Promise<CallToolResult> => {
      getLogger().debug(`Performing fetch for ID: "${id}"`);
      try {
        const ctx = getAuthenticatedContext();
        // The documented contract is a literal "ResourceType/id"; anything else (extra segments like
        // a versioned "Patient/123/_history/1", which readReference would silently resolve to the
        // current version, or a malformed reference) is rejected rather than silently mishandled.
        const parts = id.split('/');
        if (parts.length !== 2 || !/^[A-Z][a-zA-Z]+$/.test(parts[0]) || !parts[1]) {
          throw new OperationOutcomeError(
            badRequest('The id must be a FHIR reference of the form "ResourceType/id", e.g. "Patient/123"')
          );
        }
        // Binary content is base64 data that is useless truncated JSON for an LLM
        if (parts[0] === 'Binary') {
          throw new OperationOutcomeError(badRequest('Binary resources are not supported by this tool'));
        }
        const resource = await ctx.repo.readReference({ reference: id });
        const json = JSON.stringify(resource);
        return buildToolResult({
          id: getReferenceString(resource),
          title: buildTitle(resource),
          text:
            json.length > MCP_MAX_FETCH_LENGTH
              ? `${json.slice(0, MCP_MAX_FETCH_LENGTH)}... [truncated ${json.length} character resource]`
              : json,
          url: getFullUrl(resource.resourceType, resource.id),
        });
      } catch (err) {
        return buildErrorResult(err);
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

/**
 * Builds a bounded display title for a resource.
 * @param resource - The resource to describe.
 * @returns The display string, truncated to the title length limit.
 */
function buildTitle(resource: Resource): string {
  const display = getDisplayString(resource);
  return display.length > MCP_MAX_TITLE_LENGTH ? `${display.slice(0, MCP_MAX_TITLE_LENGTH - 3)}...` : display;
}

/**
 * Builds a successful tool result.
 * The value is returned both as structured content and as a JSON-encoded string in the content array,
 * per the OpenAI MCP guide.
 * @param structuredContent - The structured result value.
 * @returns The tool result.
 */
function buildToolResult(structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

/**
 * Builds an error tool result containing the error as a FHIR OperationOutcome.
 * @param err - The error thrown by the tool implementation.
 * @returns The tool result with the error flag set.
 */
function buildErrorResult(err: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(normalizeOperationOutcome(err)) }],
    isError: true,
  };
}

import { concatUrls, isString, MEDPLUM_VERSION, MedplumClient } from '@medplum/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fetch from 'node-fetch';
import { z } from 'zod';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { getLogger } from '../logger';

const server = new McpServer({
  name: 'medplum',
  version: MEDPLUM_VERSION,
});

/**
 * Dummy document used for testing purposes.
 *
 * ChatGPT requires two standrad tools: "search" and "fetch".
 * We implement stub versions of these tools that return a dummy document.
 * If these tools are not implemented, ChatGPT will not connect to the Medplum server.
 */
const dummyDocument = {
  type: 'text',
  id: 'dummy-doc',
  text: 'This is a dummy document used for testing purposes.',
  uri: 'https://example.com/dummy-doc',
} as const;

server.tool('search', { query: z.string() }, async ({ query }) => {
  getLogger().debug(`Performing search for: "${query}"`);
  return { content: [dummyDocument] };
});

server.tool(
  'fetch',
  {
    id: z.string().describe('The ID of the resource to fetch, obtained from a search result.'),
  },
  async ({ id }) => {
    getLogger().debug(`Performing fetch for ID: "${id}"`);
    return { content: [dummyDocument] };
  }
);

// This the main FHIR request tool that allows clients to make FHIR requests to the Medplum server.
// The current implmentation uses the very suboptimal approach of re-fetching the URL on behalf of the client.
// Over time, we should definitely replace this with the "FhirRouter" approach, which would stay within the Medplum server and not re-fetch the URL.
// However, there are a few FHIR endpoints that are not yet available in FhirRouter, so we need to use fetch for now.
server.tool(
  'fhir-request',
  {
    method: z.string(),
    path: z.string(),
    body: z.any(),
  },
  async ({ method, path, body }) => {
    const ctx = getAuthenticatedContext();
    const baseUrl = getConfig().baseUrl;
    const baseFhirUrl = concatUrls(baseUrl, 'fhir/R4');
    const fhirUrl = concatUrls(baseFhirUrl, path);
    const accessToken = ctx.authState.accessToken;
    const proxy = new MedplumClient({ baseUrl, accessToken, fetch });

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

export function getMcpServer(): McpServer {
  return server;
}

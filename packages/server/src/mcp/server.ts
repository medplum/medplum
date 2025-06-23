import { concatUrls, ContentType, isString, MEDPLUM_VERSION, MedplumClient } from '@medplum/core';
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

server.tool(
  'search',
  {
    // title: "Placeholder Search Tool - Use the 'fhir-request' tool for actual FHIR searches",
    query: z.string(),
  },
  async ({ query }) => {
    getLogger().debug(`Performing search for: "${query}"`);
    return { content: [dummyDocument] };
  }
);

server.tool(
  'fetch',
  {
    // title: "Placeholder Fetch Tool - Use the 'fhir-request' tool for actual FHIR operations",
    id: z.string(),
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
    method: z.string().describe('HTTP method to use for the request (GET, POST, PUT, PATCH, DELETE).'),
    path: z.string().describe('The FHIR path to request, e.g. "Patient/123" or "Observation?patient=123".'),
    body: z.any().optional().describe('Optional body to include in the request.'),
    headers: z.record(z.string(), z.string()).optional().describe('Optional HTTP headers to include in the request.'),
  },
  async ({ method, path, body, headers }) => {
    const ctx = getAuthenticatedContext();
    const baseUrl = getConfig().baseUrl;
    const baseFhirUrl = concatUrls(baseUrl, 'fhir/R4');
    const fhirUrl = concatUrls(baseFhirUrl, path);
    const accessToken = ctx.authState.accessToken;
    const proxy = new MedplumClient({ baseUrl, accessToken, fetch });

    headers ??= {};
    let contentType: string | undefined = undefined;
    const contentTypeHeader = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
    if (contentTypeHeader) {
      delete headers[contentTypeHeader[0]];
      contentType = contentTypeHeader[1];
    }

    // MCP allows sending JSON, but some clients (like Claude) send the body as a string
    if ((!contentType || contentType === ContentType.JSON || contentType === ContentType.FHIR_JSON) && isString(body)) {
      body = JSON.parse(body);
    }

    let response: unknown;
    switch (method.toLowerCase()) {
      case 'get':
        response = await proxy.get(fhirUrl, { headers });
        break;
      case 'delete':
        response = await proxy.delete(fhirUrl, { headers });
        break;
      case 'patch':
        response = await proxy.patch(fhirUrl, body, { headers });
        break;
      case 'post':
        response = await proxy.post(fhirUrl, body, contentType, { headers });
        break;
      case 'put':
        response = await proxy.put(fhirUrl, body, contentType, { headers });
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

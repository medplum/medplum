import { MEDPLUM_VERSION } from '@medplum/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'medplum',
  version: MEDPLUM_VERSION,
});

const dummyDocument = {
  type: 'text',
  id: 'dummy-doc',
  text: 'This is a dummy document used for testing purposes.',
  uri: 'https://example.com/dummy-doc',
} as const;

server.tool('search', { query: z.string() }, async ({ query }) => {
  console.log(`Performing search for: "${query}"`);
  return { content: [dummyDocument] };
});

server.tool(
  'fetch',
  {
    id: z.string().describe('The ID of the resource to fetch, obtained from a search result.'),
  },
  async ({ id }) => {
    console.log(`Performing fetch for ID: "${id}"`);
    return { content: [dummyDocument] };
  }
);

// Async tool with external API call
server.tool('fhir-request', { method: z.string(), path: z.string(), body: z.any() }, async ({ method, path, body }) => {
  console.log(`Performing fhir-request for: "${method} ${path}" with body:`, body);
  return {
    content: [
      {
        type: 'text',
        text: `Mock response for ${method} ${path} with body: ${JSON.stringify(body)}`,
        uri: `https://example.com/fhir/${path}`,
      },
    ],
  };
});

export function getMcpServer(): McpServer {
  return server;
}

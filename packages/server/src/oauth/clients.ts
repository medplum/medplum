import { MEDPLUM_CLI_CLIENT_ID } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

/**
 * Standard clients embeded in the Medplum server.
 *
 * Medplum CLI is represented as a special client with "medplum-cli" as its ID.
 *
 * Claude and ChatGPT are also included as standard clients as required by the MCP protocol.
 */
const standardClients: ClientApplication[] = [
  {
    resourceType: 'ClientApplication',
    id: MEDPLUM_CLI_CLIENT_ID,
    name: 'Medplum CLI',
    redirectUri: 'http://localhost:9615',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'mcp-inspector-1',
    name: 'MCP Inspector 1',
    redirectUri: 'http://127.0.0.1:6274/oauth/callback',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'mcp-inspector-2',
    name: 'MCP Inspector 2',
    redirectUri: 'http://localhost:6274/oauth/callback',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'claude',
    name: 'Claude',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'chatgpt',
    name: 'ChatGPT',
    secret: randomUUID(), // ChatGPT requires a secret, but does not use it
    redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    pkceOptional: true,
  },
];

export function getStandardClientById(clientId: string): ClientApplication | undefined {
  return standardClients.find((client) => client.id === clientId);
}

export function getStandardClientByRedirectUri(redirectUri: string): ClientApplication | undefined {
  return standardClients.find((client) => client.redirectUri === redirectUri);
}

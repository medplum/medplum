import { MEDPLUM_CLI_CLIENT_ID } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';

const standardClients: ClientApplication[] = [
  {
    resourceType: 'ClientApplication',
    id: MEDPLUM_CLI_CLIENT_ID,
    // redirectUri: 'http://localhost:9615',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'claude',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    pkceOptional: true,
  },
  {
    resourceType: 'ClientApplication',
    id: 'chatgpt',
    secret: 'SUbf2nFWwzNIcRAT1zELMVuQ8pYdNzcN',
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

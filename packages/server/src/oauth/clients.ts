import { MEDPLUM_CLI_CLIENT_ID } from '@medplum/core';
import { ClientApplication } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';

/**
 * Standard clients embeded in the Medplum server.
 *
 * Medplum CLI is represented as a special client with "medplum-cli" as its ID.
 *
 * Claude and ChatGPT are also included as standard clients as required by the MCP protocol.
 */
let standardClients: ClientApplication[] | undefined = undefined;

function getStandardClients(): ClientApplication[] {
  if (!standardClients) {
    standardClients = [
      {
        resourceType: 'ClientApplication',
        id: MEDPLUM_CLI_CLIENT_ID,
        name: 'Medplum CLI',
        redirectUri: 'http://localhost:9615',
        pkceOptional: true,
      },
    ];

    const config = getConfig();
    if (config.defaultOAuthClients) {
      standardClients.push(...config.defaultOAuthClients);
    }
  }
  return standardClients;
}

export function getStandardClientById(clientId: string): ClientApplication | undefined {
  return getStandardClients().find((client) => client.id === clientId);
}

export function getStandardClientByRedirectUri(redirectUri: string): ClientApplication | undefined {
  return getStandardClients().find((client) => client.redirectUri === redirectUri);
}

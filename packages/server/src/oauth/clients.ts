// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
        redirectUris: ['http://localhost:9615'],
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
  return getStandardClients().find((client) => getClientRedirectUri(client, redirectUri) !== undefined);
}

/**
 * Returns the matching redirect URI for a client application.
 *
 * Note on partial matching: This is generally NOT safe and most OAuth specifications recommend exact matching of redirect URIs for security reasons.
 *
 * What the specs say:
 *   1. RFC 6749 (OAuth 2.0): Recommends exact string comparison
 *   2. OAuth 2.1: Requires exact matching
 *   3. OAuth Security BCP: Strongly discourages prefix matching
 *
 * @param client - The client application.
 * @param requestedUri - The requested redirect URI.
 * @param allowPartial - Optional flag to allow partial matches. Defaults to false. This is NOT recommended.
 * @returns The matching redirect URI, or undefined if no match is found.
 */
export function getClientRedirectUri(
  client: ClientApplication,
  requestedUri: string,
  allowPartial = false
): string | undefined {
  for (const uri of getClientRedirectUris(client)) {
    if (uri === requestedUri) {
      return uri;
    }
    if (allowPartial && requestedUri.startsWith(uri)) {
      // This should be removed once all clients are migrated.
      return requestedUri;
    }
  }
  return undefined;
}

/**
 * Returns the list of redirect URIs for a client application.
 * This function handles both the deprecated `redirectUri` field.
 * After ClientApplication.redirectUri is removed, this function can be replaced by simple property access.
 * @param client - The client application.
 * @returns The list of redirect URIs.
 */
export function getClientRedirectUris(client: ClientApplication): string[] {
  const uris = [];
  if (client.redirectUri) {
    uris.push(client.redirectUri);
  }
  if (client.redirectUris) {
    uris.push(...client.redirectUris);
  }
  return uris;
}

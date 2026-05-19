// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { MEDPLUM_CLI_CLIENT_ID } from '@medplum/core';
import type { ClientApplication } from '@medplum/fhirtypes';
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

export function getStandardClientById(clientId: string): WithId<ClientApplication> | undefined {
  return getStandardClients().find((client) => client.id === clientId) as WithId<ClientApplication> | undefined;
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
    if (allowPartial && isAllowedPartialRedirectUri(uri, requestedUri)) {
      // This should be removed once all clients are migrated.
      return requestedUri;
    }
  }
  return undefined;
}

function isAllowedPartialRedirectUri(actualUri: string, requestedUri: string): boolean {
  // This is a temporary workaround to allow partial matching of redirect URIs for legacy clients.
  // It should be removed once all clients are migrated to use exact redirect URIs.
  try {
    const actualUrl = new URL(actualUri);
    const requestedUrl = new URL(requestedUri);
    return actualUrl.origin === requestedUrl.origin && requestedUrl.pathname.startsWith(actualUrl.pathname);
  } catch {
    return false;
  }
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

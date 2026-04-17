// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MedplumClient } from '@medplum/core';
import { ScribeAgent } from './scribe-agent';
import { IntakeAgent } from './intake-agent';
import { CodingAgent } from './coding-agent';
import type { MedplumBaseAgent } from './medplum-agent';

/**
 * Creates and authenticates a MedplumClient using client credentials from environment variables.
 * @returns A promise that resolves to an authenticated MedplumClient.
 */
async function createAuthenticatedMedplumClient(): Promise<MedplumClient> {
  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com',
  });

  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET must be set');
  }
  await medplum.startClientLogin(clientId, clientSecret);

  return medplum;
}

/**
 * Creates the appropriate agent instance based on the given agent type string.
 * @param medplum - Authenticated MedplumClient instance.
 * @param agentType - The type of agent to create ('intake', 'coding', or 'scribe').
 * @returns The instantiated agent.
 */
function createAgent(medplum: MedplumClient, agentType: string): MedplumBaseAgent {
  switch (agentType) {
    case 'intake':
      return new IntakeAgent(medplum);
    case 'coding':
      return new CodingAgent(medplum);
    case 'scribe':
    default:
      return new ScribeAgent(medplum);
  }
}

/**
 * LiveKit Agents entrypoint. Authenticates with Medplum, determines the agent type
 * from room metadata or environment, and dispatches to the appropriate agent class.
 * @param roomMetadata - Optional JSON-encoded room metadata containing agentType, encounterId, etc.
 * @returns A promise that resolves to the initialized agent.
 */
export async function entrypoint(roomMetadata?: string): Promise<MedplumBaseAgent> {
  const medplum = await createAuthenticatedMedplumClient();

  const agentType = roomMetadata
    ? ((JSON.parse(roomMetadata) as { agentType?: string }).agentType ?? 'scribe')
    : (process.env.AGENT_TYPE ?? 'scribe');

  const agent = createAgent(medplum, agentType);
  await agent.onRoomJoined(roomMetadata);

  console.log(`Agent started: ${agentType}`);
  return agent;
}

if (process.argv.includes('dev') || process.argv.includes('start')) {
  entrypoint().catch(console.error);
}

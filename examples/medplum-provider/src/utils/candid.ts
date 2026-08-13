// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { ClaimResponse } from '@medplum/fhirtypes';

// Identifier system shared by the deployed Candid Health integration bots. The bots are looked up
// by identifier so nothing renders (or runs) in projects where they are not deployed.
export const CANDID_INTEGRATION_SYSTEM = 'https://medplum.com/integrations/candid-health';

// Bot that resolves a Candid Health claim portal URL. The URL itself lives in the bot's secrets,
// so it is never hardcoded here.
export const CANDID_CLAIM_URL_BOT_IDENTIFIER = {
  system: CANDID_INTEGRATION_SYSTEM,
  value: 'get-candid-claim-portal-url',
};

// Bot that pulls the latest encounter state from Candid and refreshes the ClaimResponse.
export const CANDID_GET_ENCOUNTER_BOT_IDENTIFIER = {
  system: CANDID_INTEGRATION_SYSTEM,
  value: 'get-encounter',
};

// Identifier the send-to-candid bot writes onto the ClaimResponse; its presence marks the
// claim as a Candid claim.
export const CANDID_ENCOUNTER_ID_SYSTEM = 'https://candidhealth.com/encounter-id';

export function isCandidClaimResponse(claimResponse: ClaimResponse): boolean {
  return claimResponse.identifier?.some((id) => id.system === CANDID_ENCOUNTER_ID_SYSTEM) ?? false;
}

// Extension the get-encounter bot writes the source (Candid) claim status into.
export const SOURCE_CLAIM_STATUS_EXTENSION_URL = 'https://medplum.com/fhir/StructureDefinition/source-claim-status';

// System of the Candid claim status codes (e.g. `waiting_for_provider`, `finalized_paid`).
export const CANDID_CLAIM_STATUS_SYSTEM = 'https://candidhealth.com/claim-status';

export function getCandidEncounterId(claimResponse: ClaimResponse): string | undefined {
  return claimResponse.identifier?.find((id) => id.system === CANDID_ENCOUNTER_ID_SYSTEM)?.value;
}

export function getCandidClaimStatus(claimResponse: ClaimResponse): string | undefined {
  return claimResponse.extension
    ?.find((e) => e.url === SOURCE_CLAIM_STATUS_EXTENSION_URL)
    ?.valueCodeableConcept?.coding?.find((c) => c.system === CANDID_CLAIM_STATUS_SYSTEM)?.code;
}

/**
 * Executes the Candid `get-encounter` bot, which refreshes the given ClaimResponse with the
 * latest claim state from Candid Health. The bot takes the Candid encounter ID as input.
 * No-op when the bot is not deployed in the project or the ClaimResponse has no encounter ID.
 *
 * @param medplum - The Medplum client.
 * @param claimResponse - The Candid ClaimResponse to refresh.
 * @returns True when the bot ran (the caller should refetch the ClaimResponse), false otherwise.
 */
export async function refreshCandidClaimResponse(
  medplum: MedplumClient,
  claimResponse: ClaimResponse
): Promise<boolean> {
  const encounterId = getCandidEncounterId(claimResponse);
  if (!encounterId) {
    return false;
  }
  const bot = await medplum.searchOne('Bot', {
    identifier: `${CANDID_GET_ENCOUNTER_BOT_IDENTIFIER.system}|${CANDID_GET_ENCOUNTER_BOT_IDENTIFIER.value}`,
  });
  if (!bot?.id) {
    return false;
  }
  await medplum.executeBot(bot.id, { encounterId }, 'application/json');
  return true;
}

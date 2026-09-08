// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';

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

// Bot that searches the Candid Health payer directory.
export const CANDID_GET_PAYERS_BOT_IDENTIFIER = {
  system: CANDID_INTEGRATION_SYSTEM,
  value: 'candid-get-payers',
};

// Identifier systems the Candid bots use to resolve a payer Organization back to the Candid
// directory (see medplum-ee payer-lookup.ts). The Candid UUID is the preferred, unambiguous key.
export const CANDID_PAYER_UUID_SYSTEM = 'https://www.joincandidhealth.com/payer-uuid';
export const CHC_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/chc-payerid';
// Legacy system stamped by imports before the bot moved to Candid's payers.v4 API; kept only as
// a display fallback for previously imported payers.
export const CMS_PAYER_ID_SYSTEM = 'https://www.cms.gov/payer-id';

// Capability-specific payer ID systems stamped by the candid-get-payers bot (Candid payers.v4).
export const CANDID_ELIGIBILITY_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/eligibility-payerid';
export const CANDID_REMITTANCE_PAYER_ID_SYSTEM = 'https://www.joincandidhealth.com/remittance-payerid';

// Coding system for Candid's payer category (e.g. MEDICARE, BCBS), stamped in Organization.type.
export const CANDID_PAYER_CATEGORY_SYSTEM = 'https://www.joincandidhealth.com/payer-category';

// Extensions carrying the best support state per capability across Candid's clearinghouses.
export const CANDID_ELIGIBILITY_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/eligibility-support';
export const CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/professional-claims-support';
export const CANDID_REMITTANCE_SUPPORT_EXTENSION =
  'https://candidhealth.com/fhir/StructureDefinition/remittance-support';

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

// The submit operation writes the Candid encounter id onto both the Claim and its ClaimResponse.
export function getCandidEncounterId(resource: Claim | ClaimResponse): string | undefined {
  return resource.identifier?.find((id) => id.system === CANDID_ENCOUNTER_ID_SYSTEM)?.value;
}

export function getCandidClaimStatus(claimResponse: ClaimResponse): string | undefined {
  return claimResponse.extension
    ?.find((e) => e.url === SOURCE_CLAIM_STATUS_EXTENSION_URL)
    ?.valueCodeableConcept?.coding?.find((c) => c.system === CANDID_CLAIM_STATUS_SYSTEM)?.code;
}

/**
 * Executes the Candid `get-encounter` bot, which refreshes the stored ClaimResponse with the
 * latest claim state from Candid Health. The bot takes the Candid encounter ID as input, which
 * can come from either the Claim or its ClaimResponse (the submit operation writes it onto both).
 * No-op when the resource has no Candid encounter ID or the bot is not deployed in the project.
 *
 * @param medplum - The Medplum client.
 * @param resource - The Claim or ClaimResponse carrying the Candid encounter-id identifier.
 * @returns True when the bot ran, false otherwise.
 */
export async function refreshCandidClaimResponse(
  medplum: MedplumClient,
  resource: Claim | ClaimResponse
): Promise<boolean> {
  const encounterId = getCandidEncounterId(resource);
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

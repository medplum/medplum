// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ClaimResponse, Coding } from '@medplum/fhirtypes';
import { SOURCE_CLAIM_STATUS_EXTENSION_URL } from './candid';

// Identifier the Stedi webhook handler writes onto the ClaimResponse; its presence marks the
// claim as a Stedi claim.
export const STEDI_CLAIM_IDENTIFIER_SYSTEM = 'https://www.stedi.com/claims';

// System of the X12 claim status category codes (external code list 507, e.g. `A1`, `P1`, `F1`)
// that the Stedi webhook handler writes into the source-claim-status extension.
export const X12_CLAIM_STATUS_CATEGORY_SYSTEM = 'https://codesystem.x12.org/external/507';

export function isStediClaimResponse(claimResponse: ClaimResponse): boolean {
  return claimResponse.identifier?.some((id) => id.system === STEDI_CLAIM_IDENTIFIER_SYSTEM) ?? false;
}

export function getStediClaimStatus(claimResponse: ClaimResponse): Coding | undefined {
  return claimResponse.extension
    ?.find((e) => e.url === SOURCE_CLAIM_STATUS_EXTENSION_URL)
    ?.valueCodeableConcept?.coding?.find((c) => c.system === X12_CLAIM_STATUS_CATEGORY_SYSTEM);
}

// X12 507 category codes group by first letter: A* acknowledgements, P* pending,
// F* finalized, E* errors. Unknown prefixes fall back to the raw code.
export function formatStediClaimStatus(coding: Coding): string {
  switch (coding.code?.charAt(0)) {
    case 'A':
      return 'Received';
    case 'P':
      return 'Pending';
    case 'F':
      return 'Finalized';
    case 'E':
      return 'Error';
    default:
      return coding.code ?? 'Unknown';
  }
}

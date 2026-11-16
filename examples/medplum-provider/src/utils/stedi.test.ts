// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ClaimResponse } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { SOURCE_CLAIM_STATUS_EXTENSION_URL } from './candid';
import {
  formatStediClaimStatus,
  getStediClaimStatus,
  isStediClaimResponse,
  STEDI_CLAIM_IDENTIFIER_SYSTEM,
  X12_CLAIM_STATUS_CATEGORY_SYSTEM,
} from './stedi';

const base = { resourceType: 'ClaimResponse' } as ClaimResponse;
const x12Pending = { system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: 'P1' };
const vendor = { system: 'https://www.stedi.com/internal-status', code: 'SUBMITTED' };
const stediResponse: ClaimResponse = {
  ...base,
  identifier: [{ system: STEDI_CLAIM_IDENTIFIER_SYSTEM, value: 'stedi-claim-123' }],
  extension: [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [vendor, x12Pending] } }],
};

describe('stedi', () => {
  test('isStediClaimResponse is true only when an identifier uses the Stedi claim system', () => {
    expect(isStediClaimResponse(stediResponse)).toBe(true);
    expect(isStediClaimResponse({ ...base, identifier: [{ system: 'https://other.example' }] })).toBe(false);
    expect(isStediClaimResponse(base)).toBe(false);
  });

  test('getStediClaimStatus returns the X12 category coding from the source-claim-status extension', () => {
    expect(getStediClaimStatus(stediResponse)).toEqual(x12Pending);
  });

  test.each<[string, ClaimResponse['extension']]>([
    ['there are no extensions', undefined],
    ['no extension has the source-claim-status url', [{ url: 'https://example.com/unrelated', valueString: 'x' }]],
    ['the extension carries no coding', [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueString: 'not-a-coding' }]],
    ['no coding is X12', [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [vendor] } }]],
  ])('getStediClaimStatus is undefined when %s', (_name, extension) => {
    expect(getStediClaimStatus({ ...base, extension })).toBeUndefined();
  });

  test('formatStediClaimStatus groups X12 category codes by their first letter', () => {
    const labels = { A1: 'Received', P1: 'Pending', F1: 'Finalized', E0: 'Error', R3: 'R3', '': '' };
    for (const [code, label] of Object.entries(labels)) {
      expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code })).toBe(label);
    }
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM })).toBe('Unknown');
  });
});

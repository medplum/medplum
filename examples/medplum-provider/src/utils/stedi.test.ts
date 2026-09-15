// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ClaimResponse, Coding } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { SOURCE_CLAIM_STATUS_EXTENSION_URL } from './candid';
import {
  formatStediClaimStatus,
  getStediClaimStatus,
  isStediClaimResponse,
  STEDI_CLAIM_IDENTIFIER_SYSTEM,
  X12_CLAIM_STATUS_CATEGORY_SYSTEM,
} from './stedi';

const BASE_CLAIM_RESPONSE: ClaimResponse = {
  resourceType: 'ClaimResponse',
  status: 'active',
  type: { coding: [{ code: 'professional' }] },
  use: 'claim',
  patient: { reference: 'Patient/homer-simpson' },
  created: '2024-06-01T00:00:00Z',
  insurer: { reference: 'Organization/payer' },
  outcome: 'queued',
};

const X12_PENDING_CODING: Coding = { system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: 'P1', display: 'Pending' };
const VENDOR_CODING: Coding = { system: 'https://www.stedi.com/internal-status', code: 'SUBMITTED' };

/** The Stedi webhook writes the X12 status coding alongside a vendor-specific one. */
const STEDI_CLAIM_RESPONSE: ClaimResponse = {
  ...BASE_CLAIM_RESPONSE,
  identifier: [{ system: STEDI_CLAIM_IDENTIFIER_SYSTEM, value: 'stedi-claim-123' }],
  extension: [
    { url: 'https://example.com/unrelated-extension', valueString: 'ignored' },
    { url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [VENDOR_CODING, X12_PENDING_CODING] } },
  ],
};

describe('isStediClaimResponse', () => {
  test('is true only when an identifier uses the Stedi claim system', () => {
    expect(isStediClaimResponse(STEDI_CLAIM_RESPONSE)).toBe(true);
    expect(isStediClaimResponse({ ...BASE_CLAIM_RESPONSE, identifier: [{ system: 'https://other.example' }] })).toBe(
      false
    );
    expect(isStediClaimResponse(BASE_CLAIM_RESPONSE)).toBe(false);
  });
});

describe('getStediClaimStatus', () => {
  test('returns the X12 category coding from the source-claim-status extension', () => {
    expect(getStediClaimStatus(STEDI_CLAIM_RESPONSE)).toEqual(X12_PENDING_CODING);
  });

  test.each<[string, ClaimResponse['extension']]>([
    ['the response has no extensions', undefined],
    ['no extension has the source-claim-status url', [{ url: 'https://example.com/unrelated', valueString: 'x' }]],
    ['the extension carries no coding', [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueString: 'not-a-coding' }]],
    [
      'no coding uses the X12 category system',
      [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [VENDOR_CODING] } }],
    ],
  ])('is undefined when %s', (_name, extension) => {
    expect(getStediClaimStatus({ ...BASE_CLAIM_RESPONSE, extension })).toBeUndefined();
  });
});

describe('formatStediClaimStatus', () => {
  test.each<[string | undefined, string]>([
    ['A1', 'Received'],
    ['A2', 'Received'],
    ['P1', 'Pending'],
    ['F1', 'Finalized'],
    ['E0', 'Error'],
    ['R3', 'R3'],
    ['', ''],
    [undefined, 'Unknown'],
  ])('maps %s to %s', (code, label) => {
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code })).toBe(label);
  });
});

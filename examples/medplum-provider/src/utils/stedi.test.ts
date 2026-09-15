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
  type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
  use: 'claim',
  patient: { reference: 'Patient/homer-simpson' },
  created: '2024-06-01T00:00:00Z',
  insurer: { reference: 'Organization/payer' },
  outcome: 'queued',
};

const X12_PENDING_CODING: Coding = { system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: 'P1', display: 'Pending' };

/** The Stedi webhook writes the X12 status coding alongside a vendor-specific one. */
const STEDI_CLAIM_RESPONSE: ClaimResponse = {
  ...BASE_CLAIM_RESPONSE,
  identifier: [
    { system: 'https://example.com/other-ids', value: 'other-1' },
    { system: STEDI_CLAIM_IDENTIFIER_SYSTEM, value: 'stedi-claim-123' },
  ],
  extension: [
    { url: 'https://example.com/unrelated-extension', valueString: 'ignored' },
    {
      url: SOURCE_CLAIM_STATUS_EXTENSION_URL,
      valueCodeableConcept: {
        coding: [{ system: 'https://www.stedi.com/internal-status', code: 'SUBMITTED' }, X12_PENDING_CODING],
      },
    },
  ],
};

describe('isStediClaimResponse', () => {
  test('is true when an identifier uses the Stedi claim system', () => {
    expect(isStediClaimResponse(STEDI_CLAIM_RESPONSE)).toBe(true);
  });

  test('is false when identifiers use other systems', () => {
    expect(
      isStediClaimResponse({
        ...BASE_CLAIM_RESPONSE,
        identifier: [{ system: 'https://joincandidhealth.com/claims', value: 'candid-1' }],
      })
    ).toBe(false);
  });

  test('is false when there are no identifiers', () => {
    expect(isStediClaimResponse(BASE_CLAIM_RESPONSE)).toBe(false);
    expect(isStediClaimResponse({ ...BASE_CLAIM_RESPONSE, identifier: [] })).toBe(false);
  });
});

describe('getStediClaimStatus', () => {
  test('returns the X12 category coding from the source-claim-status extension', () => {
    expect(getStediClaimStatus(STEDI_CLAIM_RESPONSE)).toEqual(X12_PENDING_CODING);
  });

  test('is undefined when the response has no extensions', () => {
    expect(getStediClaimStatus(BASE_CLAIM_RESPONSE)).toBeUndefined();
  });

  test('is undefined when no extension has the source-claim-status url', () => {
    expect(
      getStediClaimStatus({
        ...BASE_CLAIM_RESPONSE,
        extension: [{ url: 'https://example.com/unrelated-extension', valueString: 'ignored' }],
      })
    ).toBeUndefined();
  });

  test('is undefined when the extension carries no codeable concept', () => {
    expect(
      getStediClaimStatus({
        ...BASE_CLAIM_RESPONSE,
        extension: [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueString: 'not-a-coding' }],
      })
    ).toBeUndefined();
  });

  test('is undefined when the codeable concept has no coding array', () => {
    expect(
      getStediClaimStatus({
        ...BASE_CLAIM_RESPONSE,
        extension: [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { text: 'Pending' } }],
      })
    ).toBeUndefined();
  });

  test('is undefined when no coding uses the X12 category system', () => {
    expect(
      getStediClaimStatus({
        ...BASE_CLAIM_RESPONSE,
        extension: [
          {
            url: SOURCE_CLAIM_STATUS_EXTENSION_URL,
            valueCodeableConcept: { coding: [{ system: 'https://www.stedi.com/internal-status', code: 'SUBMITTED' }] },
          },
        ],
      })
    ).toBeUndefined();
  });
});

describe('formatStediClaimStatus', () => {
  test.each([
    ['A1', 'Received'],
    ['A2', 'Received'],
    ['P1', 'Pending'],
    ['P3', 'Pending'],
    ['F1', 'Finalized'],
    ['F2', 'Finalized'],
    ['E0', 'Error'],
    ['E1', 'Error'],
  ])('maps %s to %s', (code, label) => {
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code })).toBe(label);
  });

  test('falls back to the raw code for an unknown prefix', () => {
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: 'R3' })).toBe('R3');
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: 'D0' })).toBe('D0');
  });

  test('falls back to Unknown when the coding has no code', () => {
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM })).toBe('Unknown');
  });

  test('returns an empty string unchanged rather than Unknown', () => {
    expect(formatStediClaimStatus({ system: X12_CLAIM_STATUS_CATEGORY_SYSTEM, code: '' })).toBe('');
  });
});

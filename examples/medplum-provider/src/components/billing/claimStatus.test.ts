// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimResponse, ClaimResponseItem } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { CANDID_CLAIM_STATUS_SYSTEM, SOURCE_CLAIM_STATUS_EXTENSION_URL } from '../../utils/candid';
import { X12_CLAIM_STATUS_CATEGORY_SYSTEM } from '../../utils/stedi';
import { formatCode, getAdjudicationAmount, getAdjustmentReasons, getClaimDisplayStatus } from './claimStatus';

const claim = (status: Claim['status']): Claim =>
  ({ resourceType: 'Claim', status, patient: { reference: 'Patient/1' } }) as Claim;

const response = (fields: Partial<ClaimResponse>): ClaimResponse =>
  ({ resourceType: 'ClaimResponse', status: 'active', outcome: 'queued', ...fields }) as ClaimResponse;

const withSourceStatus = (system: string, code: string): Partial<ClaimResponse> => ({
  extension: [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [{ system, code }] } }],
});

describe('getClaimDisplayStatus', () => {
  test.each([
    ['cancelled', 'voided'],
    ['entered-in-error', 'voided'],
    ['draft', 'ready'],
    ['active', 'submitted'],
  ] as const)('a %s claim with no response is %s', (status, stage) => {
    expect(getClaimDisplayStatus(claim(status)).stage).toBe(stage);
  });

  test.each([
    ['rejected', 'rejected'],
    ['denied', 'denied'],
    ['finalized_denied', 'denied'],
    ['paid', 'paid'],
    ['finalized_paid', 'paid'],
    ['paid_incorrectly', 'paid-incorrectly'],
  ])('maps Candid %s to %s', (code, stage) => {
    expect(
      getClaimDisplayStatus(claim('active'), response(withSourceStatus(CANDID_CLAIM_STATUS_SYSTEM, code))).stage
    ).toBe(stage);
  });

  test('keeps any other Candid status as the detail', () => {
    const status = getClaimDisplayStatus(
      claim('active'),
      response(withSourceStatus(CANDID_CLAIM_STATUS_SYSTEM, 'submitted_to_payer'))
    );
    expect(status).toMatchObject({ stage: 'awaiting-payer', label: 'Awaiting payer', detail: 'Submitted To Payer' });
  });

  test.each([
    ['E0', 'rejected'],
    ['F1', 'paid'],
    ['P1', 'awaiting-payer'],
  ])('maps Stedi category %s to %s', (code, stage) => {
    expect(
      getClaimDisplayStatus(claim('active'), response(withSourceStatus(X12_CLAIM_STATUS_CATEGORY_SYSTEM, code))).stage
    ).toBe(stage);
  });

  test.each([
    ['error', 'rejected'],
    ['complete', 'paid'],
    ['queued', 'awaiting-payer'],
  ] as const)('falls back to the %s outcome', (outcome, stage) => {
    expect(getClaimDisplayStatus(claim('active'), response({ outcome })).stage).toBe(stage);
  });
});

describe('adjudication', () => {
  const item: ClaimResponseItem = {
    itemSequence: 1,
    adjudication: [
      { category: { coding: [{ code: 'eligible' }] }, amount: { value: 100, currency: 'USD' } },
      { category: { coding: [{ code: 'benefit' }] }, amount: { value: 80, currency: 'USD' } },
      {
        category: { coding: [{ code: 'copay' }] },
        amount: { value: 20, currency: 'USD' },
        reason: { coding: [{ code: 'PR-3' }] },
      },
    ],
  };

  test('sums the amounts in the given categories', () => {
    expect(getAdjudicationAmount(item, 'eligible')).toBe(100);
    expect(getAdjudicationAmount(item, 'benefit', 'copay')).toBe(100);
    expect(getAdjudicationAmount(item, 'deductible')).toBeUndefined();
    expect(getAdjudicationAmount(undefined, 'eligible')).toBeUndefined();
  });

  test('lists the adjustment reasons', () => {
    expect(getAdjustmentReasons(item)).toEqual([{ code: 'PR-3', amount: { value: 20, currency: 'USD' } }]);
    expect(getAdjustmentReasons(undefined)).toEqual([]);
  });

  test('formats snake_case codes', () => {
    expect(formatCode('waiting_for_provider')).toBe('Waiting For Provider');
  });
});

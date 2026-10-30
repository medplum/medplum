// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimResponse, ClaimResponseItem } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { CANDID_CLAIM_STATUS_SYSTEM, SOURCE_CLAIM_STATUS_EXTENSION_URL } from '../../utils/candid';
import { X12_CLAIM_STATUS_CATEGORY_SYSTEM } from '../../utils/stedi';
import {
  formatCode,
  getAdjudicationAmount,
  getAdjustmentReasons,
  getClaimDisplayStatus,
  getClaimStatus,
  isRemitResponse,
  sumAdjudicationAmount,
} from './claimStatus';

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
    ['complete', 'awaiting-payer'],
    ['queued', 'awaiting-payer'],
  ] as const)('falls back to the %s outcome', (outcome, stage) => {
    expect(getClaimDisplayStatus(claim('active'), response({ outcome })).stage).toBe(stage);
  });

  test('treats a complete outcome as paid only on a remit', () => {
    const remit = response({ outcome: 'complete', payment: { type: {}, amount: { value: 80, currency: 'USD' } } });
    expect(getClaimDisplayStatus(claim('active'), remit).stage).toBe('paid');
  });
});

describe('getClaimStatus', () => {
  const remit = response({ outcome: 'complete', payment: { type: {}, amount: { value: 80, currency: 'USD' } } });

  test('tells remit responses from status trackers', () => {
    expect(isRemitResponse(remit)).toBe(true);
    expect(isRemitResponse(response({ item: [{ itemSequence: 1, adjudication: [{ category: {} }] }] }))).toBe(true);
    expect(isRemitResponse(response({}))).toBe(false);
  });

  test('uses the remit once it posts while the tracker still says the payer has it', () => {
    const tracker = response(withSourceStatus(CANDID_CLAIM_STATUS_SYSTEM, 'submitted_to_payer'));
    expect(getClaimStatus(claim('active'), [tracker]).stage).toBe('awaiting-payer');
    expect(getClaimStatus(claim('active'), [remit, tracker]).stage).toBe('paid');
    expect(getClaimStatus(claim('active'), [remit]).stage).toBe('paid');
  });

  test('waits for the remit when the clearinghouse reports the claim paid', () => {
    const tracker = response(withSourceStatus(CANDID_CLAIM_STATUS_SYSTEM, 'finalized_paid'));
    expect(getClaimStatus(claim('active'), [tracker])).toMatchObject({
      stage: 'awaiting-remit',
      label: 'Awaiting remit',
    });
    expect(getClaimStatus(claim('active'), [remit, tracker]).stage).toBe('paid');
    expect(getClaimStatus(claim('active'), [response({ outcome: 'complete' })]).stage).toBe('awaiting-payer');
  });

  test('keeps a final tracker status over the remit', () => {
    const tracker = response(withSourceStatus(CANDID_CLAIM_STATUS_SYSTEM, 'denied'));
    expect(getClaimStatus(claim('active'), [remit, tracker]).stage).toBe('denied');
    expect(getClaimStatus(claim('draft'), [remit]).stage).toBe('ready');
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

  test('sums a category across lines', () => {
    const reversal: ClaimResponseItem = {
      itemSequence: 1,
      adjudication: [{ category: { coding: [{ code: 'benefit' }] }, amount: { value: -80, currency: 'USD' } }],
    };
    expect(sumAdjudicationAmount([item, item], 'eligible')).toBe(200);
    expect(sumAdjudicationAmount([item, reversal], 'benefit')).toBe(0);
    expect(sumAdjudicationAmount([reversal], 'eligible')).toBeUndefined();
  });

  test('lists the adjustment reasons', () => {
    expect(getAdjustmentReasons(item)).toEqual([{ code: 'PR-3', amount: { value: 20, currency: 'USD' } }]);
    expect(getAdjustmentReasons(undefined)).toEqual([]);
  });

  test('formats snake_case codes', () => {
    expect(formatCode('waiting_for_provider')).toBe('Waiting For Provider');
  });
});

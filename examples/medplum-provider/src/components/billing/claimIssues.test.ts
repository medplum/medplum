// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { CANDID_CLAIM_STATUS_SYSTEM, SOURCE_CLAIM_STATUS_EXTENSION_URL } from '../../utils/candid';
import { X12_CLAIM_STATUS_CATEGORY_SYSTEM } from '../../utils/stedi';
import { markPatientBalanceCollected } from './claimActions';
import { getClaimIssues, getPatientResponsibility, scanClaimIssues } from './claimIssues';
import { getPreSubmitIssues } from './preSubmitChecks';

let nextId = 0;

const claim = (fields: Partial<Claim> = {}): WithId<Claim> =>
  ({
    resourceType: 'Claim',
    id: `claim-${++nextId}`,
    status: 'active',
    patient: { reference: 'Patient/1' },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/1' } }],
    diagnosis: [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9' }] } }],
    item: [{ sequence: 1, productOrService: { coding: [{ code: '99214' }] }, diagnosisSequence: [1] }],
    ...fields,
  }) as WithId<Claim>;

const response = (fields: Partial<ClaimResponse>): ClaimResponse =>
  ({ resourceType: 'ClaimResponse', status: 'active', outcome: 'queued', ...fields }) as ClaimResponse;

const sourceStatus = (system: string, code: string): Partial<ClaimResponse> => ({
  extension: [{ url: SOURCE_CLAIM_STATUS_EXTENSION_URL, valueCodeableConcept: { coding: [{ system, code }] } }],
});

const remit = (...adjudication: NonNullable<ClaimResponse['item']>[number]['adjudication']): ClaimResponse =>
  response({
    outcome: 'complete',
    payment: { type: {}, amount: { value: 80, currency: 'USD' } },
    item: [{ itemSequence: 1, adjudication }],
  });

const codes = (c: WithId<Claim>, responses: ClaimResponse[] = []): string[] =>
  getClaimIssues(c, responses).map((i) => i.code);

describe('getPreSubmitIssues', () => {
  test('a complete draft has none', () => {
    expect(getPreSubmitIssues(claim({ status: 'draft' }))).toEqual([]);
  });

  test('flags missing coverage, diagnoses and pointers', () => {
    const issues = getPreSubmitIssues(
      claim({ status: 'draft', insurance: [], diagnosis: [], item: [{ sequence: 1, productOrService: {} }] })
    );
    expect(issues.map((i) => i.code)).toEqual(['no-insurance', 'no-diagnosis', 'no-pointer']);
    expect(issues[2].detail).toBe('1 line has no diagnosis pointer: line 1.');
  });

  test('flags diagnoses on no line', () => {
    const issues = getPreSubmitIssues(
      claim({
        diagnosis: [
          { sequence: 1, diagnosisCodeableConcept: { coding: [{ code: 'E11.9' }] } },
          { sequence: 2, diagnosisCodeableConcept: { coding: [{ code: 'I10' }] } },
          { sequence: 3 },
        ],
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'unused-diagnosis', detail: '2 diagnoses are on no line: I10, #3.' });
  });
});

describe('getPatientResponsibility', () => {
  test('adds deductible, copay, coinsurance and other PR adjustments once each', () => {
    expect(
      getPatientResponsibility([
        remit(
          { category: { coding: [{ code: 'benefit' }] }, amount: { value: 80, currency: 'USD' } },
          {
            category: { coding: [{ code: 'copay' }] },
            amount: { value: 20, currency: 'USD' },
            reason: { coding: [{ code: 'PR-3' }] },
          },
          { category: { coding: [{ code: 'deductible' }] }, amount: { value: 5, currency: 'USD' } },
          {
            category: { coding: [{ code: 'submitted' }] },
            amount: { value: 7.5, currency: 'USD' },
            reason: { coding: [{ code: 'PR-204' }] },
          },
          {
            category: { coding: [{ code: 'submitted' }] },
            amount: { value: 40, currency: 'USD' },
            reason: { coding: [{ code: 'CO-45' }] },
          }
        ),
      ])
    ).toBe(32.5);
  });

  test('is undefined without a patient share', () => {
    expect(getPatientResponsibility([])).toBeUndefined();
  });
});

describe('getClaimIssues', () => {
  test('a draft has its pre-submit issues', () => {
    expect(codes(claim({ status: 'draft', diagnosis: [] }))).toEqual(['no-diagnosis']);
  });

  test('a claim with the payer, or voided, has none', () => {
    expect(codes(claim())).toEqual([]);
    expect(codes(claim(), [response({})])).toEqual([]);
    expect(codes(claim({ status: 'cancelled', diagnosis: [] }))).toEqual([]);
  });

  test('flags a rejection', () => {
    expect(codes(claim(), [response({ outcome: 'error' })])).toEqual(['rejected']);
  });

  test.each([
    [CANDID_CLAIM_STATUS_SYSTEM, 'denied'],
    [CANDID_CLAIM_STATUS_SYSTEM, 'finalized_denied'],
    [X12_CLAIM_STATUS_CATEGORY_SYSTEM, 'F2'],
  ])('flags a %s %s denial', (system, code) => {
    expect(codes(claim(), [response(sourceStatus(system, code))])).toEqual(['denied']);
  });

  test('flags an underpayment', () => {
    const tracker = response(sourceStatus(CANDID_CLAIM_STATUS_SYSTEM, 'paid_incorrectly'));
    expect(codes(claim(), [tracker, remit()])).toEqual(['paid-incorrectly']);
  });

  test('flags a patient share until it is collected', () => {
    const c = claim();
    const paid = remit({
      category: { coding: [{ code: 'copay' }] },
      amount: { value: 20, currency: 'USD' },
    });
    const issues = getClaimIssues(c, [paid]);
    expect(issues.map((i) => i.code)).toEqual(['patient-balance']);
    expect(issues[0].detail).toBe("The patient owes $20.00 after the payer's adjudication.");

    markPatientBalanceCollected(c.id);
    expect(codes(c, [paid])).toEqual([]);
  });

  test('a fully paid claim has none', () => {
    expect(codes(claim(), [remit({ category: { coding: [{ code: 'benefit' }] } })])).toEqual([]);
  });
});

describe('scanClaimIssues', () => {
  test('finds the open claims with issues, oldest first, with their responses', async () => {
    const medplum = new MockClient();
    const create = (fields: Partial<Claim>): Promise<WithId<Claim>> => {
      const { id: _id, ...rest } = claim(fields);
      return medplum.createResource<Claim>({
        ...rest,
        use: 'claim',
        type: { coding: [{ code: 'professional' }] },
        priority: { coding: [{ code: 'normal' }] },
        provider: { reference: 'Practitioner/1' },
      });
    };
    const fine = await create({ created: '2026-10-01' });
    const draft = await create({ status: 'draft', created: '2026-10-03', insurance: [] });
    const rejected = await create({ created: '2026-10-02' });
    await create({ status: 'cancelled', created: '2026-10-01', diagnosis: [] });
    await medplum.createResource<ClaimResponse>({
      ...response({ outcome: 'error' }),
      type: { coding: [{ code: 'professional' }] },
      use: 'claim',
      patient: { reference: 'Patient/1' },
      created: '2026-10-04',
      insurer: { display: 'Aetna' },
      request: { reference: `Claim/${rejected.id}` },
    });

    const scan = await scanClaimIssues(medplum);
    expect(scan.ids).toEqual([rejected.id, draft.id]);
    expect(scan.byClaim[rejected.id].map((i) => i.code)).toEqual(['rejected']);
    expect(scan.byClaim[draft.id].map((i) => i.code)).toEqual(['no-insurance']);
    expect(scan.byClaim[fine.id]).toBeUndefined();
  });
});

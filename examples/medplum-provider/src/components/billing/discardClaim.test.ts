// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test } from 'vitest';
import { canDiscardClaim, discardClaim } from './discardClaim';

const claim = (fields: Partial<Claim> = {}): Claim => ({
  resourceType: 'Claim',
  status: 'draft',
  use: 'claim',
  type: { coding: [{ code: 'professional' }] },
  created: '2026-11-17',
  patient: { reference: 'Patient/123' },
  provider: { reference: 'Practitioner/123' },
  priority: { coding: [{ code: 'normal' }] },
  insurance: [],
  ...fields,
});

describe('discardClaim', () => {
  test('only a claim that was never submitted can be discarded', () => {
    const response = { resourceType: 'ClaimResponse' } as ClaimResponse;
    expect(canDiscardClaim(claim(), [])).toBe(true);
    expect(canDiscardClaim(claim(), [response])).toBe(false);
    expect(canDiscardClaim(claim({ status: 'cancelled' }), [])).toBe(false);
  });

  test('marks the claim entered in error', async () => {
    const medplum = new MockClient();
    const created = await medplum.createResource(claim());

    await discardClaim(medplum, created);

    expect((await medplum.readResource('Claim', created.id)).status).toBe('entered-in-error');
  });
});

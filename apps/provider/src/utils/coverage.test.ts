// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Coverage } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSelfPayCoverage } from './coverage';

describe('createSelfPayCoverage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  test('creates a self-pay coverage for patient', async () => {
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      id: 'patient-123',
    });

    const createdCoverage: Coverage = {
      resourceType: 'Coverage',
      id: 'coverage-123',
      status: 'active',
      beneficiary: { reference: 'Patient/patient-123' },
      payor: [{ reference: 'Patient/patient-123' }],
      type: {
        coding: [{ code: 'SELFPAY', display: 'Self Pay' }],
      },
      period: {
        start: new Date().toISOString(),
      },
    };
    const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(createdCoverage as any);

    const result = await createSelfPayCoverage(medplum, patient);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriber: { reference: 'Patient/patient-123' },
        beneficiary: { reference: 'Patient/patient-123' },
        payor: [{ reference: 'Patient/patient-123' }],
        type: expect.objectContaining({
          coding: [expect.objectContaining({ code: 'SELFPAY', display: 'Self Pay' })],
        }),
        period: expect.objectContaining({
          start: expect.any(String),
        }),
      })
    );
    expect(result).toBe(createdCoverage);
  });
});

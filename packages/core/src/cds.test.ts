// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Patient } from '@medplum/fhirtypes';
import type { CdsService } from './cds';
import { buildCdsRequest } from './cds';
import type { MedplumClient } from './client';

describe('buildCdsRequest', () => {
  const medplum = {
    readResource: async (resourceType: string, id: string) => ({ resourceType, id }),
    search: async (resourceType: string, _queryString: string) => ({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: { resourceType, id: '1' } }],
    }),
  } as unknown as MedplumClient;

  const user = { resourceType: 'Patient', id: '123' } satisfies Patient;

  test('Empty prefetch', async () => {
    const service: CdsService = {
      id: 'example-service',
      hook: 'patient-view',
    };

    const context = { patientId: '123' };

    const result = await buildCdsRequest(medplum, user, service, context);
    expect(result).toMatchObject({
      hook: 'patient-view',
      hookInstance: expect.any(String),
      context,
    });
  });

  test('Prefetch replacement', async () => {
    const service: CdsService = {
      id: 'example-service',
      hook: 'patient-view',
      prefetch: {
        patient: 'Patient/{{context.patientId}}',
        medications: 'MedicationRequest?patient={{context.patientId}}',
        'hemoglobin-a1c': 'Observation?patient={{context.patientId}}&code=4548-4&_count=1&sort:desc=date',
      },
    };

    const context = {
      patientId: '123',
      observationCode: '789',
    };

    const result = await buildCdsRequest(medplum, user, service, context);
    expect(result).toMatchObject({
      hook: 'patient-view',
      hookInstance: expect.any(String),
      context,
      prefetch: {
        patient: { resourceType: 'Patient', id: '123' },
        medications: {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [
            {
              resource: { resourceType: 'MedicationRequest', id: '1' },
            },
          ],
        },
        'hemoglobin-a1c': {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [
            {
              resource: { resourceType: 'Observation', id: '1' },
            },
          ],
        },
      },
    });
  });

  test('User variable', async () => {
    const service: CdsService = {
      id: 'example-service',
      hook: 'patient-view',
      prefetch: {
        user: 'Patient/{{userPatientId}}',
      },
    };

    const context = { patientId: '123' };

    const result = await buildCdsRequest(medplum, user, service, context);
    expect(result).toMatchObject({
      hook: 'patient-view',
      hookInstance: expect.any(String),
      context,
      prefetch: {
        user: { resourceType: 'Patient', id: '123' },
      },
    });
  });

  test('Ignore unsupported variable name', async () => {
    const service: CdsService = {
      id: 'example-service',
      hook: 'patient-view',
      prefetch: {
        user: 'Patient/{{foo}}',
      },
    };

    const context = { patientId: '123' };

    const result = await buildCdsRequest(medplum, user, service, context);
    expect(result).toMatchObject({
      hook: 'patient-view',
      hookInstance: expect.any(String),
      context,
      prefetch: {
        user: null,
      },
    });
  });

  test('Ignore non-string context values', async () => {
    const service: CdsService = {
      id: 'example-service',
      hook: 'patient-view',
      prefetch: {
        test: 'Observation/{{context.observation}}',
      },
    };

    const context = { patientId: '123', observation: { code: '789' } };

    const result = await buildCdsRequest(medplum, user, service, context);
    expect(result).toMatchObject({
      hook: 'patient-view',
      hookInstance: expect.any(String),
      context,
      prefetch: {
        test: null,
      },
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Patient } from '@medplum/fhirtypes';
import type { CdsService } from './cds';
import { buildCdsRequest, replaceQueryVariables } from './cds';
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

describe('replaceQueryVariables', () => {
  const user = { resourceType: 'Patient', id: '456' } satisfies Patient;

  test('User variable', async () => {
    const context = { patientId: '123' };
    const result = replaceQueryVariables(user, context, 'Patient/{{userPatientId}}');
    expect(result).toStrictEqual('Patient/456');
  });

  test('Simple context string', async () => {
    const context = { patientId: '123' };
    const result = replaceQueryVariables(user, context, 'Patient/{{context.patientId}}');
    expect(result).toStrictEqual('Patient/123');
  });

  test('Simple context number', async () => {
    const context = { patientId: 123 };
    const result = replaceQueryVariables(user, context, 'Patient/{{context.patientId}}');
    expect(result).toStrictEqual('Patient/123');
  });

  test('Simple context boolean', async () => {
    const context = { active: true };
    const result = replaceQueryVariables(user, context, 'Patient?active={{context.active}}');
    expect(result).toStrictEqual('Patient?active=true');
  });

  test('Ignore unsupported type', async () => {
    const context = { n1: { n2: { n3: true } } };
    const result = replaceQueryVariables(user, context, 'Patient/{{context.n1}}');
    expect(result).toStrictEqual('Patient/{{context.n1}}');
  });

  test('Nested object', async () => {
    const context = { medication: { id: '789' } };
    const result = replaceQueryVariables(user, context, 'MedicationRequest?_id={{context.medication.id}}');
    expect(result).toStrictEqual('MedicationRequest?_id=789');
  });

  test('Deeply nested object', async () => {
    const context = { medications: { medication: { id: '789' } } };
    const result = replaceQueryVariables(user, context, 'MedicationRequest?_id={{context.medications.medication.id}}');
    expect(result).toStrictEqual('MedicationRequest?_id=789');
  });

  test('Deeply nested undefined', async () => {
    const context = { medications: { medication: { id: '789' } } };
    const result = replaceQueryVariables(user, context, 'MedicationRequest?_id={{context.medications.foo.id}}');
    expect(result).toStrictEqual('MedicationRequest?_id={{context.medications.foo.id}}');
  });

  test('Unsupported prefix', async () => {
    const context = { patientId: '123' };
    const result = replaceQueryVariables(user, context, 'Patient/{{foo.patientId}}');
    expect(result).toStrictEqual('Patient/{{foo.patientId}}');
  });
});

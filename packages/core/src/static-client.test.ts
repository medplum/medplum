// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { createStaticClient } from './static-client';

const patient: Patient = { resourceType: 'Patient', id: '123', name: [{ given: ['Homer'] }] };

describe('createStaticClient', () => {
  test('Reads resources by type and id', async () => {
    const medplum = createStaticClient([patient]);
    await expect(medplum.readResource('Patient', '123')).resolves.toMatchObject(patient);
    await expect(medplum.readReference({ reference: 'Patient/123' })).resolves.toMatchObject(patient);
  });

  test('Ignores autoBatchTime', async () => {
    const other: Patient = { resourceType: 'Patient', id: '456' };
    const medplum = createStaticClient([patient, other], { autoBatchTime: 100 });
    await expect(
      Promise.all([medplum.readResource('Patient', '123'), medplum.readResource('Patient', '456')])
    ).resolves.toMatchObject([patient, other]);
  });

  test('Unknown resource is not found', async () => {
    const medplum = createStaticClient([patient]);
    await expect(medplum.readResource('Patient', 'missing')).rejects.toThrow('Not found');
  });

  test('Rejects requests other than reads', async () => {
    const medplum = createStaticClient([patient]);
    await expect(medplum.searchResources('Patient', 'name=Homer')).rejects.toThrow('Not supported by static client');
    await expect(medplum.createResource({ resourceType: 'Patient' })).rejects.toThrow('Not supported by static client');
  });

  test('Ignores an active login in localStorage', () => {
    localStorage.setItem('activeLogin', JSON.stringify({ accessToken: 'x', refreshToken: 'y' }));
    try {
      expect(createStaticClient([]).getActiveLogin()).toBeUndefined();
    } finally {
      localStorage.removeItem('activeLogin');
    }
  });
});

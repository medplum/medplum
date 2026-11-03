// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { createTestProject, expect, test } from '../fixtures/test';

test('Projects cannot read each other’s resources', { tag: '@smoke' }, async ({ superAdmin, testProject }) => {
  const other = await createTestProject(superAdmin, 'Other project');
  const patient = await testProject.medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Isolated'], family: 'Patient' }],
  });

  expect((await testProject.medplum.readResource('Patient', patient.id)).id).toBe(patient.id);
  await expect(other.medplum.readResource('Patient', patient.id)).rejects.toThrow('Not found');
  expect(await other.medplum.searchResources('Patient', { _id: patient.id })).toHaveLength(0);
});

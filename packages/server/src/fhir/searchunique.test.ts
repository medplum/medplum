// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { multipleMatches, Operator } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { searchUnique } from './searchunique';

describe('searchUnique', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Throws multipleMatches when more than one resource matches', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const family = randomUUID();
      const search: SearchRequest<Patient> = {
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: Operator.EQUALS, value: family }],
      };
      const patient1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
      expect((await searchUnique(repo, search))?.id).toBe(patient1.id);

      await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
      await expect(searchUnique(repo, search)).rejects.toMatchObject({ outcome: multipleMatches });
    }));
});

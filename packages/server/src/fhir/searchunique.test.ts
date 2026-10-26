// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getLogger } from '../logger';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Multiple matches are logged once per window and the first match is returned', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });
      const family = randomUUID();
      const search: SearchRequest<Patient> = {
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: Operator.EQUALS, value: family }],
      };
      const patient1 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
      expect((await searchUnique(repo, search, 'test'))?.id).toBe(patient1.id);

      const patient2 = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });
      const warnSpy = vi.spyOn(getLogger(), 'warn');

      const result = await searchUnique(repo, search, 'test');
      expect([patient1.id, patient2.id]).toContain(result?.id);
      await searchUnique(repo, search, 'test');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'Search matched multiple resources',
        expect.objectContaining({
          source: 'test',
          search: 'Patient?family=' + family,
          projectId: repo.currentProject()?.id,
          matchIds: [patient1.id, patient2.id].sort((a, b) => a.localeCompare(b)),
          returnedId: result?.id,
          suppressed: 0,
        })
      );
    }));
});

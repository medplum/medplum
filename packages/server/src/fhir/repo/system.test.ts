// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, withTestContext } from '../../test.setup';
import * as workersModule from '../../workers';
import { getShardSystemRepo, Repository } from '../repo';

jest.mock('hibp');

describe('Repository system factories', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Skip background jobs when configured', () =>
    withTestContext(async () => {
      const { project } = await createTestProject();

      const repo = new Repository({
        projects: [project],
        currentProject: project,
        extendedMode: true,
        skipBackgroundJobs: true,
        author: {
          reference: 'Practitioner/' + randomUUID(),
        },
      });

      expect(repo.getSystemRepo().getConfig().skipBackgroundJobs).toBe(true);
      expect(getShardSystemRepo('test-shard', undefined, { skipBackgroundJobs: true }).getConfig().skipBackgroundJobs).toBe(
        true
      );

      const addBackgroundJobsSpy = jest.spyOn(workersModule, 'addBackgroundJobs').mockResolvedValue(undefined);
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      await repo.updateResource<Patient>({
        ...patient,
        active: true,
      });
      await repo.deleteResource(patient.resourceType, patient.id);

      expect(addBackgroundJobsSpy).not.toHaveBeenCalled();
    }));
});

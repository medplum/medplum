// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Patient, Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { getLogger } from '../../logger';
import { createTestProject, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getProjectSystemRepo } from '../repo';

jest.mock('hibp');

describe('Repository access tracker', () => {
  let systemRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    const { project } = await createTestProject();
    systemRepo = await getProjectSystemRepo(project);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Logs mixed cache access for readReferences across split resource types', async () =>
    withTestContext(async () => {
      const infoSpy = jest.spyOn(getLogger(), 'info').mockImplementation(() => {});
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Split Cache Project' });
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      await systemRepo.readReferences([
        { reference: `Project/${project.id}` },
        { reference: `Patient/${patient.id}` },
      ]);

      expect(infoSpy).toHaveBeenCalledWith(
        '[RepoSplit] Mixed resource access',
        expect.objectContaining({
          scope: 'statement',
          layer: 'cache',
          operation: 'read',
          source: 'repo.getCacheEntries',
          specialResourceTypes: ['Project'],
          otherResourceTypes: ['Patient'],
          resourceTypes: ['Patient', 'Project'],
        })
      );
    }));

  test('Logs mixed SQL access for multi-type search across split resource types', async () =>
    withTestContext(async () => {
      const infoSpy = jest.spyOn(getLogger(), 'info').mockImplementation(() => {});
      await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Split Search Project' });
      await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      await systemRepo.search({
        resourceType: 'Patient',
        types: ['Project', 'Patient'],
        count: 10,
        offset: 0,
      });

      expect(infoSpy).toHaveBeenCalledWith(
        '[RepoSplit] Mixed resource access',
        expect.objectContaining({
          scope: 'statement',
          layer: 'sql',
          operation: 'read',
          source: 'search.getSearchEntries',
          specialResourceTypes: ['Project'],
          otherResourceTypes: ['Patient'],
          resourceTypes: ['Patient', 'Project'],
        })
      );
    }));

  test('Logs mixed transaction access across repo and system repo', async () =>
    withTestContext(async () => {
      const infoSpy = jest.spyOn(getLogger(), 'info').mockImplementation(() => {});
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Split Tx Project' });
      const patient = await systemRepo.createResource<Patient>({ resourceType: 'Patient' });

      await systemRepo.withTransaction(async () => {
        await systemRepo.readResource('Patient', patient.id);
        await systemRepo.getSystemRepo().readResource('Project', project.id);
      });

      expect(infoSpy).toHaveBeenCalledWith(
        '[RepoSplit] Mixed transaction access',
        expect.objectContaining({
          scope: 'transaction',
          status: 'committed',
          specialResourceTypes: ['Project'],
          otherResourceTypes: ['Patient'],
          readResourceTypes: ['Patient', 'Project'],
          writeResourceTypes: [],
        })
      );
    }));
});

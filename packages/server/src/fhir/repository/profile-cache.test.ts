// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import type { Login, Patient, StructureDefinition, UserConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, withTestContext } from '../../test.setup';
import { getRepoForLogin } from '../accesspolicy';

jest.mock('hibp');

describe('Repository profile cache', () => {
  const usCorePatientProfile = JSON.parse(
    readFileSync(resolve(__dirname, '../__test__/us-core-patient.json'), 'utf8')
  ) as StructureDefinition;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Handles caching of profile from linked project', async () =>
    withTestContext(async () => {
      const { project: project2, repo: repo2 } = await createTestProject({ withRepo: true });
      const { project, repo, membership } = await createTestProject({
        withRepo: true,
        withClient: true,
        membership: { admin: true },
        project: { link: [{ project: createReference(project2) }] },
      });

      const profile = await repo2.createResource<StructureDefinition>({
        ...usCorePatientProfile,
        url: 'urn:uuid:' + randomUUID(),
      });

      const patientJson: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: [profile.url],
        },
      };

      // Resource upload should fail with profile linked
      await expect(repo.createResource(patientJson)).rejects.toThrow(/Missing required property/);

      // Unlink Project and verify that profile is not cached; resource upload should succeed without access to profile
      const unlinkedProject = await repo.updateResource({
        ...project,
        link: undefined,
      });

      const newRepo = await getRepoForLogin({
        login: {} as Login,
        membership,
        project: unlinkedProject,
        userConfig: {} as UserConfiguration,
      });
      await expect(repo.createResource(patientJson)).rejects.toThrow(/Missing required property/);
      await expect(newRepo.createResource(patientJson)).resolves.toBeDefined();
    }));
});

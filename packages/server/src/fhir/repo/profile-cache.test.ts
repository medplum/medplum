// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import type { Login, Patient, Project, StructureDefinition, UserConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initAppServices, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { withTestContext } from '../../test.setup';
import { getRepoForLogin } from '../accesspolicy';
import { getGlobalSystemRepo } from '../repo';

jest.mock('hibp');

describe('Repository profile cache', () => {
  const globalSystemRepo = getGlobalSystemRepo();
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

  test('Handles caching of profile from linked project', () =>
    withTestContext(async () => {
      const { membership, project } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const { membership: membership2, project: project2 } = await registerNew({
        firstName: randomUUID(),
        lastName: randomUUID(),
        projectName: randomUUID(),
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      const updatedProject = await globalSystemRepo.updateResource<Project>({
        ...project,
        link: [{ project: createReference(project2) }],
      });

      const repo2 = await getRepoForLogin({
        login: {} as Login,
        membership: membership2,
        project: project2,
        userConfig: {} as UserConfiguration,
      });
      const profile = await repo2.createResource({ ...usCorePatientProfile, url: 'urn:uuid:' + randomUUID() });

      const patientJson: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: [profile.url],
        },
      };

      let repo = await getRepoForLogin({
        login: {} as Login,
        membership,
        project: updatedProject,
        userConfig: {} as UserConfiguration,
      });
      await expect(repo.createResource(patientJson)).rejects.toThrow(/Missing required property/);

      const unlinkedProject = await globalSystemRepo.updateResource({
        ...updatedProject,
        link: undefined,
      });
      repo = await getRepoForLogin({
        login: {} as Login,
        membership,
        project: unlinkedProject,
        userConfig: {} as UserConfiguration,
      });
      await expect(repo.createResource(patientJson)).resolves.toBeDefined();
    }));
});

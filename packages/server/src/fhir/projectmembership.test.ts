// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { AccessPolicy, Bot, ClientApplication, Practitioner, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { membershipProfileTypes, readMembershipReference } from './projectmembership';
import type { SystemRepository } from './repo';
import { getProjectSystemRepo } from './repo';

describe('readMembershipReference', () => {
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    systemRepo = await getProjectSystemRepo(randomUUID());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Reads resources by project', () =>
    withTestContext(async () => {
      const { project } = await createTestProject();
      const { project: otherProject } = await createTestProject();
      const { project: linkedProject } = await createTestProject();
      const linkingProject = await systemRepo.updateResource({
        ...project,
        link: [{ project: createReference(linkedProject) }],
      });
      const membership = {
        resourceType: 'ProjectMembership',
        project: createReference(linkingProject),
      } as ProjectMembership;

      const ownProfile = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        meta: { project: project.id },
      });
      const otherProfile = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        meta: { project: otherProject.id },
      });
      const linkedProfile = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        meta: { project: linkedProject.id },
      });
      const linkedPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        meta: { project: linkedProject.id },
      });
      const projectlessPolicy = await systemRepo.createResource<AccessPolicy>({ resourceType: 'AccessPolicy' });
      const projectlessClient = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        secret: randomUUID(),
      });

      const read = (resource: Practitioner | AccessPolicy | ClientApplication, allowLinkedProjects?: boolean): any =>
        readMembershipReference(
          systemRepo,
          membership,
          createReference(resource),
          [...membershipProfileTypes, 'AccessPolicy'],
          { allowLinkedProjects }
        );

      await expect(read(ownProfile)).resolves.toMatchObject({ id: ownProfile.id });
      await expect(read(otherProfile, true)).rejects.toThrow('Not found');
      await expect(read(linkedProfile)).rejects.toThrow('Not found');
      await expect(read(linkedProfile, true)).resolves.toMatchObject({ id: linkedProfile.id });
      await expect(read(linkedPolicy, true)).rejects.toThrow('Not found');
      await expect(read(projectlessPolicy)).resolves.toMatchObject({ id: projectlessPolicy.id });
      await expect(read(projectlessClient, true)).rejects.toThrow('Not found');
    }));

  test('Rejects unexpected resource types', () =>
    withTestContext(async () => {
      const { project, membership } = await createTestProject({ withClient: true });
      await expect(
        readMembershipReference(systemRepo, membership, createReference(project), membershipProfileTypes)
      ).rejects.toThrow('Not found');
    }));

  test('Respects exported resource types of linked projects', () =>
    withTestContext(async () => {
      const { project } = await createTestProject();
      const { project: linkedProject } = await createTestProject({
        project: { exportedResourceType: ['Bot'] },
      });
      const linkingProject = await systemRepo.updateResource({
        ...project,
        link: [{ project: createReference(linkedProject) }],
      });
      const membership = {
        resourceType: 'ProjectMembership',
        project: createReference(linkingProject),
      } as ProjectMembership;

      const bot = await systemRepo.createResource<Bot>({ resourceType: 'Bot', meta: { project: linkedProject.id } });
      const practitioner = await systemRepo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        meta: { project: linkedProject.id },
      });

      await expect(
        readMembershipReference(systemRepo, membership, createReference(bot), membershipProfileTypes, {
          allowLinkedProjects: true,
        })
      ).resolves.toMatchObject({ id: bot.id });
      await expect(
        readMembershipReference(systemRepo, membership, createReference(practitioner), membershipProfileTypes, {
          allowLinkedProjects: true,
        })
      ).rejects.toThrow('Not found');
    }));
});

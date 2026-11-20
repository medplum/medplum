// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, normalizeErrorString } from '@medplum/core';
import type {
  AccessPolicy,
  Bot,
  ClientApplication,
  Organization,
  Practitioner,
  Project,
  ProjectMembership,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { vi } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { membershipProfileTypes, readMembershipReference, readMembershipReferences } from './projectmembership';
import type { SystemRepository } from './repo';
import { getProjectSystemRepo } from './repo';

let systemRepo: SystemRepository;
let project: WithId<Project>;
let otherProject: WithId<Project>;
let linkedProject: WithId<Project>;
// A membership in `project`, which links to `linkedProject`
let membership: ProjectMembership;

beforeAll(async () => {
  const config = await loadTestConfig();
  await initAppServices(config);
  systemRepo = await getProjectSystemRepo(randomUUID());
  ({ project: otherProject } = await createTestProject());
  ({ project: linkedProject } = await createTestProject());
  const { project: linkingProject } = await createTestProject();
  project = await systemRepo.updateResource({ ...linkingProject, link: [{ project: createReference(linkedProject) }] });
  membership = { resourceType: 'ProjectMembership', project: createReference(project) } as ProjectMembership;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await shutdownApp();
});

describe('readMembershipReference', () => {
  test('Reads resources by project', () =>
    withTestContext(async () => {
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

      const readSpy = vi.spyOn(systemRepo, 'readReference');
      await expect(read(ownProfile)).resolves.toMatchObject({ id: ownProfile.id });
      expect(readSpy).toHaveBeenCalledTimes(1); // Same-project reads skip loading projects
      await expect(read(otherProfile, true)).rejects.toThrow('Not found');
      await expect(read(linkedProfile)).rejects.toThrow('Not found');
      await expect(read(linkedProfile, true)).resolves.toMatchObject({ id: linkedProfile.id });
      await expect(read(linkedPolicy)).rejects.toThrow('Not found');
      await expect(read(linkedPolicy, true)).resolves.toMatchObject({ id: linkedPolicy.id });
      await expect(read(projectlessPolicy, true)).rejects.toThrow('Not found');
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
      const policy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
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
      await expect(
        readMembershipReference(systemRepo, membership, createReference(policy), ['AccessPolicy'], {
          allowLinkedProjects: true,
        })
      ).rejects.toThrow('Not found');
    }));
});

describe('readMembershipReferences', () => {
  test('Reads a batch of resources by project', () =>
    withTestContext(async () => {
      const create = (projectId: string): Promise<WithId<Organization>> =>
        systemRepo.createResource<Organization>({ resourceType: 'Organization', meta: { project: projectId } });
      const own = await create(project.id);
      const linked = await create(linkedProject.id);
      const linked2 = await create(linkedProject.id);
      const other = await create(otherProject.id);
      const deleted = await create(project.id);
      await systemRepo.deleteResource('Organization', deleted.id);
      const references = [own, linked, other, deleted, linked2].map((r) => createReference(r));
      references.push({ reference: `Organization/${randomUUID()}` });

      const readSpy = vi.spyOn(systemRepo, 'readReference');
      const readReferencesSpy = vi.spyOn(systemRepo, 'readReferences');
      const results = await readMembershipReferences(systemRepo, membership, references, {
        allowLinkedProjects: true,
      });
      expect(results.map((r) => (r instanceof Error ? normalizeErrorString(r) : r.id))).toStrictEqual([
        own.id,
        linked.id,
        'Not found',
        'Gone',
        linked2.id,
        'Not found',
      ]);
      // One batched read of the references, and the membership's project is loaded once for all of them
      expect(readReferencesSpy).toHaveBeenNthCalledWith(1, references);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Linked projects are only allowed when requested
      const [notLinked] = await readMembershipReferences(systemRepo, membership, [createReference(linked)]);
      expect(normalizeErrorString(notLinked)).toBe('Not found');

      // Same-project reads skip loading projects
      readSpy.mockClear();
      await expect(
        readMembershipReferences(systemRepo, membership, [createReference(own)], { allowLinkedProjects: true })
      ).resolves.toMatchObject([{ id: own.id }]);
      expect(readSpy).not.toHaveBeenCalled();
    }));
});

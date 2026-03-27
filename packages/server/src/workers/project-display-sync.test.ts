// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, WithId } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Patient, Project, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { syncProjectDisplayNames } from './project-display-sync';

const app = express();
const context = { interaction: 'update' } as BackgroundJobContext;

describe('syncProjectDisplayNames', () => {
  let repo: Repository;
  let systemRepo: Repository;
  let project: WithId<Project>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ project, repo } = await createTestProject({ withRepo: true }));
    systemRepo = repo.getSystemRepo();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('No-op for non-Project resources', async () => {
    await withTestContext(async () => {
      const patient: WithId<Patient> = {
        resourceType: 'Patient',
        id: '123',
        meta: { versionId: '1' },
      };
      await syncProjectDisplayNames(patient, undefined, context);
    });
  });

  test('No-op for new Project (no previous version)', async () => {
    await withTestContext(async () => {
      await syncProjectDisplayNames(project, undefined, context);
    });
  });

  test('No-op when name has not changed', async () => {
    await withTestContext(async () => {
      const previous = { ...project, name: project.name };
      await syncProjectDisplayNames(project, previous, context);
    });
  });

  test('Updates membership display when Project is renamed', async () => {
    await withTestContext(async () => {
      const memberships = await systemRepo.searchResources<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [{ code: 'project', operator: Operator.EQUALS, value: `Project/${project.id}` }],
      });
      expect(memberships.length).toBeGreaterThan(0);

      const oldName = project.name;
      expect(memberships[0].project.display).toBe(oldName);

      const newName = 'Renamed Project ' + Date.now();
      const updatedProject = await systemRepo.updateResource<Project>({
        ...project,
        name: newName,
      });

      await syncProjectDisplayNames(updatedProject, project, context);

      const updatedMemberships = await systemRepo.searchResources<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [{ code: 'project', operator: Operator.EQUALS, value: `Project/${project.id}` }],
      });

      for (const m of updatedMemberships) {
        expect(m.project.display).toBe(newName);
      }
    });
  });
});

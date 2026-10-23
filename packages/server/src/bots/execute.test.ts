// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Bot, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { executeBot } from './execute';

describe('executeBot', () => {
  beforeAll(async () => {
    await initAppServices(await loadTestConfig());
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Ignores a runAsProject that is not the runAs project', async () => {
    const project = await getGlobalSystemRepo().createResource<Project>({ resourceType: 'Project', features: [] });
    const bot: WithId<Bot> = { resourceType: 'Bot', id: randomUUID(), auditEventTrigger: 'never' };
    const runAs: WithId<ProjectMembership> = {
      resourceType: 'ProjectMembership',
      id: randomUUID(),
      project: createReference(project),
      user: { reference: `User/${randomUUID()}` },
      profile: createReference(bot),
    };

    const result = await executeBot({
      bot,
      runAs,
      runAsProject: { resourceType: 'Project', id: randomUUID(), features: ['bots'] },
      input: '',
      contentType: 'text/plain',
    });

    expect(result).toMatchObject({ success: false, logResult: 'Bots not enabled' });
  });
});

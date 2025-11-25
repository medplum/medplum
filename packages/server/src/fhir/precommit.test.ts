// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Project, Subscription } from '@medplum/fhirtypes';
import { createBot } from '../admin/bot';
import { inviteUser } from '../admin/invite';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { systemLogger } from '../logger';
import { createTestProject, withTestContext } from '../test.setup';
import { deployBot } from './operations/deploy';
import type { Repository } from './repo';

describe('FHIR Repo', () => {
  let project: WithId<Project>;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    config.preCommitSubscriptionsEnabled = true;
    await initAppServices(config);

    ({ project, repo } = await createTestProject({
      withRepo: true,
      project: {
        setting: [{ name: 'preCommitSubscriptionsEnabled', valueBoolean: true }],
      },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Pre-commit bot execute with boolean return', () =>
    withTestContext(async () => {
      // Create a test bot
      const bot = await createBot(repo, {
        project,
        name: 'Pre-commit test bot',
        runtimeVersion: 'vmcontext',
      });

      // Deploy the bot
      await deployBot(
        repo,
        bot,
        `exports.handler = async function (medplum, event) {
        if (event.input.name[0].given[0] === 'Homer') {
          throw 'Invalid name';
        }
        return true;
      };`
      );

      // Create a pre-commit subscription to the bot
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        extension: [{ url: 'https://medplum.com/fhir/StructureDefinition/pre-commit-bot', valueBoolean: true }],
        status: 'active',
        reason: 'Test subscription',
        criteria: 'Patient?name=Simpson',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot),
        },
      });
      expect(subscription.id).toBeDefined();

      // Try to create a patient with a valid name
      const patient1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Bart'], family: 'Simpson' }],
      });
      expect(patient1.id).toBeDefined();

      // Try to create a patient with an invalid name
      await expect(
        repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Homer'], family: 'Simpson' }],
        })
      ).rejects.toThrow('Invalid name');
    }));

  test('Pre-commit bot execute with Resource return', () =>
    withTestContext(async () => {
      // Create a test bot
      const bot = await createBot(repo, {
        project,
        name: 'Pre-commit test bot',
        runtimeVersion: 'vmcontext',
      });

      // Deploy the bot
      await deployBot(
        repo,
        bot,
        `exports.handler = async function (medplum, event) {
        if (event.input.name[0].given[0] === 'Homer') {
          throw 'Invalid name';
        }
        return event.input;
      };`
      );

      // Create a pre-commit subscription to the bot
      const subscription = await repo.createResource<Subscription>({
        resourceType: 'Subscription',
        extension: [{ url: 'https://medplum.com/fhir/StructureDefinition/pre-commit-bot', valueBoolean: true }],
        status: 'active',
        reason: 'Test subscription',
        criteria: 'Patient?name=Simpson',
        channel: {
          type: 'rest-hook',
          endpoint: getReferenceString(bot),
        },
      });
      expect(subscription.id).toBeDefined();

      // Try to create a patient with a valid name
      const patient1 = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Bart'], family: 'Simpson' }],
      });
      expect(patient1.id).toBeDefined();

      // Try to create a patient with an invalid name
      await expect(
        repo.createResource<Patient>({
          resourceType: 'Patient',
          name: [{ given: ['Homer'], family: 'Simpson' }],
        })
      ).rejects.toThrow('Invalid name');
    }));

  test('Checks critical references', async () => {
    const { profile } = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'Doctor',
    });

    const logSpy = jest.spyOn(systemLogger, 'warn');
    await expect(repo.deleteResource('Practitioner', profile.id)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith('Deleting resource referenced by ProjectMembership', expect.any(Error));
  });
});

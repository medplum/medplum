// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { Patient, Subscription } from '@medplum/fhirtypes';
import { createBot } from '../admin/bot';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { deployBot } from './operations/deploy';

describe('FHIR Repo', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    config.preCommitSubscriptionsEnabled = true;
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Pre-commit bot execute with boolean return', async () => {
    // Create a test project
    const { project, repo } = await createTestProject({
      withRepo: true,
      project: {
        setting: [{ name: 'preCommitSubscriptionsEnabled', valueBoolean: true }],
      },
    });

    await withTestContext(async () => {
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
    });
  });

  test('Pre-commit bot execute with Resource return', async () => {
    // Create a test project
    const { project, repo } = await createTestProject({
      withRepo: true,
      project: {
        setting: [{ name: 'preCommitSubscriptionsEnabled', valueBoolean: true }],
      },
    });

    await withTestContext(async () => {
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
    });
  });
});

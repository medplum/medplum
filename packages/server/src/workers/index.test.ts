// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BackgroundJobContext, WithId } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { addBackgroundJobs, closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, initDatabase } from '../database';
import { loadStructureDefinitions } from '../fhir/structure';
import { getLogger } from '../logger';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { initBinaryStorage } from '../storage/loader';
import * as cronModule from './cron';
import * as downloadModule from './download';
import * as subscriptionModule from './subscription';

describe('Workers', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('Init and close', async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    await initDatabase(config);
    await seedDatabase();
    initBinaryStorage('file:binary');
    initWorkers(config);
    await closeWorkers();
    await closeDatabase();
    await closeRedis();
  });

  describe('addBackgroundJobs', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test.each(['error', 'string'])('Errors handled', async (errorType) => {
      const resource: WithId<Patient> = {
        resourceType: 'Patient',
        id: '123',
        meta: {
          versionId: '1',
        },
      };

      const loggerErrorSpy = jest.spyOn(getLogger(), 'error');

      const subSpy = jest.spyOn(subscriptionModule, 'addSubscriptionJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      const downloadSpy = jest.spyOn(downloadModule, 'addDownloadJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      const cronSpy = jest.spyOn(cronModule, 'addCronJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      await addBackgroundJobs(resource, undefined, {} as BackgroundJobContext);

      expect(subSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenCalledTimes(1);
      expect(cronSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(3);
    });
  });
});

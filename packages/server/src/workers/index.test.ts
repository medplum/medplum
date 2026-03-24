// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { addBackgroundJobs, closeWorkers, initWorkers } from '.';
import { loadTestConfig } from '../config/loader';
import type { WorkerName } from '../config/types';
import { closeDatabase, initDatabase } from '../database';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { loadStructureDefinitions } from '../fhir/structure';
import { getLogger } from '../logger';
import { closeRedis, initRedis } from '../redis';
import { seedDatabase } from '../seed';
import { initBinaryStorage } from '../storage/loader';
import * as cronModule from './cron';
import * as dispatchModule from './dispatch';
import * as downloadModule from './download';
import * as subscriptionModule from './subscription';
import { queueRegistry } from './utils';

describe('Workers', () => {
  const shardId = GLOBAL_SHARD_ID;
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('Init and close', async () => {
    const config = await loadTestConfig();
    initRedis(config);
    await initDatabase(config);
    await seedDatabase(config);
    initBinaryStorage('file:binary');
    initWorkers(config);
    await closeWorkers();
    await closeDatabase();
    await closeRedis();
  });

  test('Init with workers.enabled = [] (HTTP-only pool)', async () => {
    const config = await loadTestConfig();
    config.workers = { enabled: [] };
    initRedis(config);
    await initDatabase(config);
    await seedDatabase(config);
    initBinaryStorage('file:binary');
    initWorkers(config);

    // Queues should still be available for enqueuing even with no workers enabled
    expect(queueRegistry.get('SubscriptionQueue')).toBeDefined();

    await closeWorkers();
    await closeDatabase();
    await closeRedis();
  });

  test.each([[[]], [['subscription']], [['subscription', '*']]] as [(WorkerName | '*')[]][])(
    'Init with workers.enabled %s',
    async (enabledWorkers) => {
      const config = await loadTestConfig();
      config.workers = { enabled: enabledWorkers };
      initRedis(config);
      await initDatabase(config);
      await seedDatabase(config);
      initBinaryStorage('file:binary');
      initWorkers(config);

      // Queues should still be available regardless of which workers are enabled
      expect(queueRegistry.get('SubscriptionQueue')).toBeDefined();
      expect(queueRegistry.get('DownloadQueue')).toBeDefined();

      await closeWorkers();
      await closeDatabase();
      await closeRedis();
    }
  );

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

      const loggerErrorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});

      const dispatchSpy = jest.spyOn(dispatchModule, 'addDispatchJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      const subSpy = jest.spyOn(subscriptionModule, 'addSubscriptionJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      const downloadSpy = jest.spyOn(downloadModule, 'addDownloadJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      const cronSpy = jest.spyOn(cronModule, 'addCronJobs').mockImplementation(() => {
        throw errorType === 'error' ? new Error('Test error') : 'Test error';
      });

      await addBackgroundJobs(shardId, resource, undefined, {} as BackgroundJobContext);

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(subSpy).toHaveBeenCalledTimes(0);
      expect(downloadSpy).toHaveBeenCalledTimes(0);
      expect(cronSpy).toHaveBeenCalledTimes(0);
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    });

    test('Missing dispatch queue is logged', async () => {
      const resource: WithId<Patient> = {
        resourceType: 'Patient',
        id: '123',
        meta: {
          versionId: '1',
        },
      };

      const loggerErrorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => {});
      jest.spyOn(queueRegistry, 'get').mockReturnValue(undefined);

      await addBackgroundJobs(shardId, resource, undefined, {} as BackgroundJobContext);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error adding dispatch jobs',
        expect.objectContaining({
          resourceType: 'Patient',
          resource: '123',
          err: expect.objectContaining({
            message: 'DispatchQueue is not initialized; call initWorkers() before enqueuing dispatch jobs',
          }),
        })
      );
    });
  });
});

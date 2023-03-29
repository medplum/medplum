import { Repository, systemRepo } from '../fhir/repo';
import { loadTestConfig } from '../config';
import { initAppServices, shutdownApp } from '../app';
import { Bot } from '@medplum/fhirtypes';
import { createTestProject } from '../test.setup';
import { createReference } from '@medplum/core';
import { convertTimingToCron, getScheduledTimingQueue } from './scheduledtiming';

jest.mock('node-fetch');

// let repo: Repository;

describe('Scheduled Timing Worker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    // Create a project
    const botProjectDetails = await createTestProject();
    new Repository({
      extendedMode: true,
      project: botProjectDetails.project.id,
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('should add a job to the queue when a bot with cronTiming is created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getScheduledTimingQueue() as any;
    queue.add.mockClear();
    const bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'bot-1',
      cronTiming: {
        repeat: {
          period: 30,
          dayOfWeek: ['mon', 'wed', 'fri'],
        },
      },
    });
    expect(bot).toBeDefined();
    expect(queue.add).toHaveBeenCalled();
  });

  test('should add a job to the queue when a bot with cronString added', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getScheduledTimingQueue() as any;
    queue.add.mockClear();
    const bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'bot-1',
      cronString: '* */2 * * 4,5',
    });
    expect(bot).toBeDefined();
    expect(queue.add).toHaveBeenCalled();
  });

  test('should not add a job to the queue when a bot with cronString', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getScheduledTimingQueue() as any;
    queue.add.mockClear();
    const bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'bot-1',
      cronString: 'testing',
    });
    expect(bot).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });


  test('should not have added a job to the queue due to a cron not created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getScheduledTimingQueue() as any;
    queue.add.mockClear();
    const bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'bot-1',
    });
    // Bot should have still been created
    expect(bot).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Update queue after updating bot scheduledTiming', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getScheduledTimingQueue() as any;
    queue.add.mockClear();
    const bot = await systemRepo.createResource<Bot>({
      resourceType: 'Bot',
      name: 'bot-1',
      cronTiming: {
        repeat: {
          period: 30,
          dayOfWeek: ['mon', 'wed', 'fri'],
        },
      },
    });

    await systemRepo.updateResource({
      resourceType: 'Bot',
      id: bot.id,
      cronTiming: {
        repeat: {
          period: 10,
          dayOfWeek: ['mon'],
        },
      },
    });

    expect(bot).toBeDefined();
    expect(queue.getJob).toBeCalled();
    expect(queue.add).toBeCalledTimes(2);
  });
});

describe('convertTimingToCron', () => {
  test('cron pattern for repeating job 15 times a day', () => {
    const timing = {
      repeat: {
        period: 15,
      },
    };

    const expected = '0 */2 * * *';

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for repeating job 48 times a day', () => {
    const timing = {
      repeat: {
        period: 48,
      },
    };

    const expected = '*/30 * * * *';

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for specific days of the week', () => {
    const timing = {
      repeat: {
        dayOfWeek: ['mon', 'wed', 'fri'] as ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[],
      },
    };

    const expected = '0 */24 * * 1,3,5';

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });

  test('cron pattern for no repeat period or days of the week', () => {
    const timing = {};

    const expected = undefined;

    const result = convertTimingToCron(timing);

    expect(result).toEqual(expected);
  });
});

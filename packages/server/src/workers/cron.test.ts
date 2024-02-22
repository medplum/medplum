import { createReference } from '@medplum/core';
import { AuditEvent, Bot, Project, ProjectMembership } from '@medplum/fhirtypes';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { Repository, getSystemRepo } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import { CronJobData, convertTimingToCron, execBot, getCronQueue } from './cron';

jest.mock('node-fetch');

describe('Cron Worker', () => {
  const systemRepo = getSystemRepo();
  let botProject: Project;
  let botRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    // Create a project
    const botProjectDetails = await createTestProject({ withClient: true });
    botProject = botProjectDetails.project;
    botRepo = new Repository({
      extendedMode: true,
      projects: [botProjectDetails.project.id as string],
      author: createReference(botProjectDetails.client),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('should add a job to the queue when a bot with cronTiming is created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.add.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronTiming: {
          repeat: {
            period: 30,
            dayOfWeek: ['mon', 'wed', 'fri'],
          },
        },
      })
    );
    expect(bot).toBeDefined();
    expect(queue.add).toHaveBeenCalled();
  });

  test('should add a job to the queue when a bot with cronString added', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.add.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: '* */2 * * 4,5',
      })
    );
    expect(bot).toBeDefined();
    expect(queue.add).toHaveBeenCalled();
  });

  test('should not add a job to the queue when a bot with cronString', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.add.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: 'testing',
      })
    );
    expect(bot).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('should not have added a job to the queue due to a cron not created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.add.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
      })
    );
    // Bot should have still been created
    expect(bot).toBeDefined();
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('Update queue after updating bot', () =>
    withTestContext(async () => {
      // Add the bot and check that a job was added to the queue.
      const queue = getCronQueue() as any;
      queue.add.mockClear();
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronTiming: {
          repeat: {
            period: 30,
            dayOfWeek: ['mon', 'wed', 'fri'],
          },
        },
      });

      await botRepo.updateResource({
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
      expect(queue.getRepeatableJobs).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(2);
    }));

  test('Find a previous job to remove after updating bot', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: '* * * * *',
      });

      expect(bot).toBeDefined();
      expect(queue.getRepeatableJobs).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();

      queue.getRepeatableJobs.mockImplementation(() => [
        {
          key: `CronJobData:${bot.id}:::* * * * *`,
          id: bot.id,
        },
      ]);
      await botRepo.updateResource({
        resourceType: 'Bot',
        id: bot.id,
        cronTiming: {
          repeat: {
            period: 10,
            dayOfWeek: ['mon'],
          },
        },
      });

      expect(queue.removeRepeatableByKey).toHaveBeenCalled();
    }));

  test('Job should not be in queue if cron is not enabled', () =>
    withTestContext(async () => {
      // Create a simple project with no advanced features enabled
      const queue = getCronQueue() as any;
      queue.add.mockClear();

      // Create one simple project with no advanced features enabled
      const testProject = await systemRepo.createResource<Project>({
        resourceType: 'Project',
        name: 'Test Project',
        owner: {
          reference: 'User/' + randomUUID(),
        },
      });

      const repo = new Repository({
        extendedMode: true,
        projects: [testProject.id as string],
        author: {
          reference: 'ClientApplication/' + randomUUID(),
        },
      });

      const bot = await repo.createResource<Bot>({
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
      expect(queue.add).not.toHaveBeenCalled();
    }));

  test('Bot should execute successfully', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.add.mockClear();

      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronTiming: {
          repeat: {
            period: 30,
            dayOfWeek: ['mon', 'wed', 'fri'],
          },
        },
      });
      await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(botProject),
        user: createReference(bot),
        profile: createReference(bot),
      });

      // Create a job object to pass to execBot
      const job: Job<CronJobData> = {
        id: bot.id,
        data: {
          resourceType: 'Bot',
          botId: bot.id,
        },
      } as Job<CronJobData>;

      await execBot(job);
      const bundle = await botRepo.search<AuditEvent>({ resourceType: 'AuditEvent' });
      expect(bundle.entry?.length).toEqual(1);
    }));
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

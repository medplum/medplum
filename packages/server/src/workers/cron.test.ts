// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { AuditEvent, Bot, Cron, Parameters, Practitioner, Project, ProjectMembership } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import * as executeModule from '../bots/execute';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import type { CronJobData } from './cron';
import { convertTimingToCron, execBot, getCronQueue } from './cron';
import { findAndExecDispatchJob } from './test-utils';

describe('Cron Worker', () => {
  let botProject: Project;
  let botRepo: Repository;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    // Create a project
    const botProjectDetails = await createTestProject({ withClient: true });
    botProject = botProjectDetails.project;
    botRepo = new Repository({
      extendedMode: true,
      projects: [botProjectDetails.project],
      author: createReference(botProjectDetails.client),
    });
    systemRepo = botRepo.getSystemRepo();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('should add a job to the queue when a bot with cronTiming is created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.upsertJobScheduler.mockClear();
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
    await findAndExecDispatchJob(bot, 'create');
    expect(queue.upsertJobScheduler).toHaveBeenCalled();
  });

  test('should add a job to the queue when a bot with cronString added', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.upsertJobScheduler.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: '* */2 * * 4,5',
      })
    );
    expect(bot).toBeDefined();
    await findAndExecDispatchJob(bot, 'create');
    expect(queue.upsertJobScheduler).toHaveBeenCalled();
  });

  test('should not add a job to the queue when a bot with cronString', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.upsertJobScheduler.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: 'testing',
      })
    );
    expect(bot).toBeDefined();
    await findAndExecDispatchJob(bot, 'create');
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  test('should not have added a job to the queue due to a cron not created', async () => {
    // Add the bot and check that a job was added to the queue.
    const queue = getCronQueue() as any;
    queue.upsertJobScheduler.mockClear();
    const bot = await withTestContext(() =>
      botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
      })
    );
    // Bot should have still been created
    expect(bot).toBeDefined();
    await findAndExecDispatchJob(bot, 'create');
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  test('Update queue after updating bot', () =>
    withTestContext(async () => {
      // Add the bot and check that a job was added to the queue.
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();
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
      await findAndExecDispatchJob(bot, 'create');

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
      await findAndExecDispatchJob(bot, 'create');
      expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
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
      await findAndExecDispatchJob(bot, 'create');
      expect(queue.upsertJobScheduler).toHaveBeenCalled();

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

      await findAndExecDispatchJob(bot, 'create');
      expect(queue.upsertJobScheduler).toHaveBeenCalled();
    }));

  test('Job should not be in queue if cron is not enabled', () =>
    withTestContext(async () => {
      // Create a simple project with no advanced features enabled
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

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
        projects: [testProject],
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
      await findAndExecDispatchJob(bot, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('Bot should execute successfully', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

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
      expect(bundle.entry?.length).toStrictEqual(1);
    }));

  test('Deleting a bot removes its job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const bot = await botRepo.createResource<Bot>({
        resourceType: 'Bot',
        name: 'bot-1',
        cronString: '* * * * *',
      });
      await findAndExecDispatchJob(bot, 'create');

      queue.removeJobScheduler.mockClear();
      await botRepo.deleteResource('Bot', bot.id);
      await findAndExecDispatchJob(bot, 'delete');
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(bot.id);
    }));
});

describe('Cron resource', () => {
  let project: Project;
  let repo: Repository;
  let systemRepo: SystemRepository;
  let bot: Bot;
  let botMembership: ProjectMembership;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const details = await createTestProject({ withClient: true, project: { features: ['cron'] } });
    project = details.project;
    repo = new Repository({
      extendedMode: true,
      // Constraints are only enforced in strict mode; the loose path logs them and moves on
      strictMode: true,
      projects: [details.project],
      author: createReference(details.client),
    });
    systemRepo = repo.getSystemRepo();

    bot = await withTestContext(() => repo.createResource<Bot>({ resourceType: 'Bot', name: 'cron-target' }));
    botMembership = await withTestContext(() =>
      systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(bot),
        profile: createReference(bot),
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('onBehalfOf is required', () =>
    withTestContext(async () => {
      await expect(
        repo.createResource<Cron>({
          resourceType: 'Cron',
          cronString: '* * * * *',
          targetReference: createReference(bot),
        } as Cron)
      ).rejects.toThrow('Missing required property');
    }));

  test('onBehalfOf must be a literal reference', () =>
    withTestContext(async () => {
      // A logical reference names nothing the job can resolve an identity from
      await expect(
        repo.createResource<Cron>({
          resourceType: 'Cron',
          onBehalfOf: { display: 'Some membership' },
          cronString: '* * * * *',
          targetReference: createReference(bot),
        })
      ).rejects.toThrow('Constraint cron-1 not met');
    }));

  test('Creating a Cron with a cronString adds a job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
        targetReference: createReference(bot),
      });
      await findAndExecDispatchJob(cron, 'create');

      // Namespaced so a Cron can never address a Bot's scheduler
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `Cron/${cron.id}`,
        { pattern: '* * * * *' },
        { data: { resourceType: 'Cron', cronId: cron.id } }
      );
    }));

  test('An invalid cronString adds no job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: 'not a cron expression',
        targetReference: createReference(bot),
      });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('Removing the cronString removes the job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
        targetReference: createReference(bot),
      });
      await findAndExecDispatchJob(cron, 'create');

      queue.removeJobScheduler.mockClear();
      await repo.updateResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        id: cron.id,
        targetReference: createReference(bot),
      });
      await findAndExecDispatchJob(cron, 'update');
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
    }));

  test('Deleting a Cron removes the job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
        targetReference: createReference(bot),
      });
      await findAndExecDispatchJob(cron, 'create');

      queue.removeJobScheduler.mockClear();
      await repo.deleteResource('Cron', cron.id);
      await findAndExecDispatchJob(cron, 'delete');
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
    }));

  test('No job without the cron project feature', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const plain = await createTestProject({ withClient: true, project: { features: [] } });
      const plainRepo = new Repository({
        extendedMode: true,
        projects: [plain.project],
        author: createReference(plain.client),
      });

      const cron = await plainRepo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
      });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('execBot runs the target bot as onBehalfOf with the Cron parameters', () =>
    withTestContext(async () => {
      const practitioner = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });
      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: { reference: 'User/' + randomUUID() },
        profile: createReference(practitioner),
      });

      const parameters: Parameters = {
        resourceType: 'Parameters',
        parameter: [{ name: 'greeting', valueString: 'hello' }],
      };

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        cronString: '* * * * *',
        targetReference: createReference(bot),
        onBehalfOf: createReference(membership),
        parameters,
      });

      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).toHaveBeenCalledTimes(1);
      const args = executeBotSpy.mock.calls[0][0];
      expect(args.bot.id).toStrictEqual(bot.id);
      expect(args.runAs.id).toStrictEqual(membership.id);
      expect(args.runAs.profile).toMatchObject(createReference(practitioner));
      expect(args.input).toMatchObject(parameters);
      executeBotSpy.mockRestore();
    }));

  test('execBot rejects an onBehalfOf membership in another project', () =>
    withTestContext(async () => {
      const other = await createTestProject({ withClient: true, project: { features: ['cron'] } });
      const otherMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(other.project),
        user: { reference: 'User/' + randomUUID() },
        profile: createReference(other.client),
      });

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        cronString: '* * * * *',
        targetReference: createReference(bot),
        onBehalfOf: createReference(otherMembership),
      });

      await expect(execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>)).rejects.toThrow(
        'Cron onBehalfOf membership belongs to a different project'
      );
    }));

  test('execBot rejects a target bot in another project', () =>
    withTestContext(async () => {
      const other = await createTestProject({ withClient: true, project: { features: ['cron'] } });
      const otherRepo = new Repository({
        extendedMode: true,
        projects: [other.project],
        author: createReference(other.client),
      });
      const otherBot = await otherRepo.createResource<Bot>({ resourceType: 'Bot', name: 'other-project-bot' });

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
        targetReference: createReference(otherBot),
      });

      await expect(execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>)).rejects.toThrow(
        'Cron target bot belongs to a different project'
      );
    }));

  test('execBot rejects a Cron with no target', () =>
    withTestContext(async () => {
      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        onBehalfOf: createReference(botMembership),
        cronString: '* * * * *',
      });
      await expect(execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>)).rejects.toThrow(
        'Could not find target for cron job'
      );
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

    expect(result).toStrictEqual(expected);
  });

  test('cron pattern for repeating job 48 times a day', () => {
    const timing = {
      repeat: {
        period: 48,
      },
    };

    const expected = '*/30 * * * *';

    const result = convertTimingToCron(timing);

    expect(result).toStrictEqual(expected);
  });

  test('cron pattern for specific days of the week', () => {
    const timing = {
      repeat: {
        dayOfWeek: ['mon', 'wed', 'fri'] as ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[],
      },
    };

    const expected = '0 */24 * * 1,3,5';

    const result = convertTimingToCron(timing);

    expect(result).toStrictEqual(expected);
  });

  test('cron pattern for no repeat period or days of the week', () => {
    const timing = {};

    const expected = undefined;

    const result = convertTimingToCron(timing);

    expect(result).toStrictEqual(expected);
  });
});

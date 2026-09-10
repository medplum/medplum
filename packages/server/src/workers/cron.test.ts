// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  createReference,
  getReferenceString,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  resolveId,
  serverError,
} from '@medplum/core';
import type {
  AuditEvent,
  Bot,
  Cron,
  CronParameter,
  ParametersParameter,
  Practitioner,
  Project,
  ProjectMembership,
} from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import * as executeModule from '../bots/execute';
import { loadTestConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { Repository } from '../fhir/repo';
import { getBinaryStorage } from '../storage/loader';
import type { TestProjectResult } from '../test.setup';
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

  // Both references are built inside the callbacks: `test.each` rows are evaluated at collection
  // time, before `beforeAll` has assigned them.
  function validCron(): Cron {
    return {
      resourceType: 'Cron',
      active: true,
      cronString: '* * * * *',
      onBehalfOf: createReference(botMembership),
      targetReference: createReference(bot),
    };
  }

  test.each(['active', 'cronString', 'onBehalfOf', 'targetReference'])('%s is required', (field) =>
    withTestContext(async () => {
      const { [field as 'onBehalfOf']: _omitted, ...withoutField } = validCron();
      await expect(repo.createResource<Cron>(withoutField as Cron)).rejects.toThrow('Missing required property');
    })
  );

  test.each([
    ['cron-1', 'onBehalfOf'],
    ['cron-2', 'targetReference'],
  ])('Constraint %s rejects a logical reference', (key, field) =>
    withTestContext(async () => {
      // A logical reference names nothing the job can resolve
      await expect(repo.createResource<Cron>({ ...validCron(), [field]: { display: 'Logical only' } })).rejects.toThrow(
        `Constraint ${key} not met`
      );
    })
  );

  test('Creating a Cron with a cronString adds a job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
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

  test.each(['not a cron expression', '10-2 * * * *'])('An invalid cronString is rejected: %s', (cronString) =>
    withTestContext(async () => {
      await expect(repo.createResource<Cron>({ ...validCron(), cronString })).rejects.toThrow(
        `Invalid cron expression: '${cronString}'`
      );
    })
  );

  test('An inactive Cron schedules nothing', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({ ...validCron(), active: false });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('Turning off active removes the job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const cron = await repo.createResource<Cron>(validCron());
      await findAndExecDispatchJob(cron, 'create');

      queue.removeJobScheduler.mockClear();
      await repo.updateResource<Cron>({ ...cron, active: false });
      await findAndExecDispatchJob(cron, 'update');
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
    }));

  test('An endTime in the past schedules nothing', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({ ...validCron(), endTime: '2020-01-01T00:00:00.000Z' });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('An endTime in the future still schedules', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const cron = await repo.createResource<Cron>({ ...validCron(), endTime: '2200-01-01T00:00:00.000Z' });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `Cron/${cron.id}`,
        { pattern: '* * * * *' },
        { data: { resourceType: 'Cron', cronId: cron.id } }
      );
    }));

  test('execBot removes the job once the endTime has passed', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      const cron = await repo.createResource<Cron>({ ...validCron(), endTime: '2020-01-01T00:00:00.000Z' });
      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).not.toHaveBeenCalled();
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
      executeBotSpy.mockRestore();
    }));

  test('Changing the cronString reschedules the job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const cron = await repo.createResource<Cron>(validCron());
      await findAndExecDispatchJob(cron, 'create');

      queue.upsertJobScheduler.mockClear();
      await repo.updateResource<Cron>({ ...cron, cronString: '0 */3 * * *' });
      await findAndExecDispatchJob(cron, 'update');
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `Cron/${cron.id}`,
        { pattern: '0 */3 * * *' },
        { data: { resourceType: 'Cron', cronId: cron.id } }
      );
    }));

  test('Search by identifier', () =>
    withTestContext(async () => {
      const value = randomUUID();
      const cron = await repo.createResource<Cron>({
        ...validCron(),
        identifier: [{ system: 'https://example.com/cron', value }],
      });

      const matches = await repo.searchResources<Cron>(
        parseSearchRequest(`Cron?identifier=https://example.com/cron|${value}`)
      );
      expect(matches.map((c) => c.id)).toStrictEqual([cron.id]);

      const others = await repo.searchResources<Cron>(parseSearchRequest(`Cron?identifier=${randomUUID()}`));
      expect(others).toHaveLength(0);
    }));

  test('Deleting a Cron removes the job', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
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

      const plainBot = await plainRepo.createResource<Bot>({ resourceType: 'Bot', name: 'ungated-target' });
      const plainMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(plain.project),
        user: createReference(plainBot),
        profile: createReference(plainBot),
      });

      const cron = await plainRepo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        onBehalfOf: createReference(plainMembership),
        targetReference: createReference(plainBot),
        cronString: '* * * * *',
      });
      await findAndExecDispatchJob(cron, 'create');
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  test('execBot runs the target bot as onBehalfOf with the Cron as input', () =>
    withTestContext(async () => {
      const practitioner = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });
      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: { reference: 'User/' + randomUUID() },
        profile: createReference(practitioner),
      });

      const parameter: CronParameter[] = [{ name: 'greeting', valueString: 'hello' }];

      const cron = await repo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        cronString: '* * * * *',
        targetReference: createReference(bot),
        onBehalfOf: createReference(membership),
        parameter,
      });

      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).toHaveBeenCalledTimes(1);
      const args = executeBotSpy.mock.calls[0][0];
      expect(args.bot.id).toStrictEqual(bot.id);
      expect(args.runAs.id).toStrictEqual(membership.id);
      expect(args.runAs.profile).toMatchObject(createReference(practitioner));
      expect(args.input).toMatchObject({ resourceType: 'Cron', id: cron.id, parameter });
      executeBotSpy.mockRestore();
    }));

  test('A parameter value outside the supported types is rejected', () =>
    withTestContext(async () => {
      // Cron.parameter.value[x] carries a deliberately narrow subset of Parameters.parameter's types
      const parameter: ParametersParameter[] = [{ name: 'dose', valueQuantity: { value: 5, unit: 'mg' } }];
      await expect(repo.createResource<Cron>({ ...validCron(), parameter })).rejects.toThrow(
        'Invalid additional property "valueQuantity"'
      );
    }));

  test('Rejects an onBehalfOf membership in another project', () =>
    withTestContext(async () => {
      const other = await createTestProject({ withClient: true, project: { features: ['cron'] } });
      const otherMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(other.project),
        user: { reference: 'User/' + randomUUID() },
        profile: createReference(other.client),
      });

      await expect(
        repo.createResource<Cron>({ ...validCron(), onBehalfOf: createReference(otherMembership) })
      ).rejects.toThrow(`Cannot resolve 'ProjectMembership/${otherMembership.id}'`);
    }));

  test('Rejects a target bot in an unlinked project', () =>
    withTestContext(async () => {
      const other = await createTestProject({ withClient: true, project: { features: ['cron'] } });
      const otherRepo = new Repository({
        extendedMode: true,
        projects: [other.project],
        author: createReference(other.client),
      });
      const otherBot = await otherRepo.createResource<Bot>({ resourceType: 'Bot', name: 'other-project-bot' });

      await expect(
        repo.createResource<Cron>({ ...validCron(), targetReference: createReference(otherBot) })
      ).rejects.toThrow(`Cannot resolve 'Bot/${otherBot.id}'`);
    }));

  test('A Cron rejected on write schedules nothing', () =>
    withTestContext(async () => {
      const queue = getCronQueue() as any;
      queue.upsertJobScheduler.mockClear();

      const other = await createTestProject({ withClient: true });
      const otherRepo = new Repository({
        extendedMode: true,
        projects: [other.project],
        author: createReference(other.client),
      });
      const otherBot = await otherRepo.createResource<Bot>({ resourceType: 'Bot', name: 'never-scheduled' });

      await expect(
        repo.createResource<Cron>({ ...validCron(), targetReference: createReference(otherBot) })
      ).rejects.toThrow('Cannot resolve');

      // Failing the write is what keeps an unrunnable job off the scheduler entirely
      expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    }));

  // None of these recover on a retry, so the tick unregisters the job rather than failing forever
  test.each([
    ['its target bot is deleted', 'targetReference'],
    ['its onBehalfOf membership is deleted', 'onBehalfOf'],
  ])('execBot unregisters the job once %s', (_name, field) =>
    withTestContext(async () => {
      const doomedBot = await repo.createResource<Bot>({ resourceType: 'Bot', name: 'doomed-target' });
      const doomedMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(doomedBot),
        profile: createReference(doomedBot),
      });
      const cron = await repo.createResource<Cron>({
        ...validCron(),
        targetReference: createReference(doomedBot),
        onBehalfOf: createReference(doomedMembership),
      });

      if (field === 'targetReference') {
        await repo.deleteResource('Bot', doomedBot.id);
      } else {
        await systemRepo.deleteResource('ProjectMembership', doomedMembership.id);
      }

      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).not.toHaveBeenCalled();
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
      executeBotSpy.mockRestore();
    })
  );

  test('execBot keeps the job when a read fails for any other reason', () =>
    withTestContext(async () => {
      const cron = await repo.createResource<Cron>(validCron());

      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      // Only a target that is gone unregisters: a transient failure must not cost the schedule
      const readSpy = vi
        .spyOn(Repository.prototype, 'readReference')
        .mockRejectedValueOnce(new OperationOutcomeError(serverError(new Error('database is down'))));

      await expect(execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>)).rejects.toThrow(
        'database is down'
      );
      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
      readSpy.mockRestore();
    }));

  test('execBot unregisters the job when its project cannot be read', () =>
    withTestContext(async () => {
      // A system-level write is the only way a Cron ends up with no project to check at all
      const cron = await systemRepo.createResource<Cron>(validCron());
      expect(cron.meta?.project).toBeUndefined();

      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).not.toHaveBeenCalled();
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
      executeBotSpy.mockRestore();
    }));

  test('execBot skips a job whose project lost the cron feature, but keeps its schedule', () =>
    withTestContext(async () => {
      // A project of its own, so turning the feature off does not disturb the shared one
      const gated = await createTestProject({ withClient: true, project: { features: ['cron'] } });
      const gatedRepo = new Repository({
        extendedMode: true,
        strictMode: true,
        projects: [gated.project],
        author: createReference(gated.client),
      });
      const gatedBot = await gatedRepo.createResource<Bot>({ resourceType: 'Bot', name: 'gated-target' });
      const gatedMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(gated.project),
        user: createReference(gatedBot),
        profile: createReference(gatedBot),
      });
      const cron = await gatedRepo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        cronString: '* * * * *',
        onBehalfOf: createReference(gatedMembership),
        targetReference: createReference(gatedBot),
      });

      await systemRepo.updateResource<Project>({ ...gated.project, features: [] });

      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).not.toHaveBeenCalled();
      // The feature can come back, and nothing re-registers a job that was dropped
      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
      executeBotSpy.mockRestore();
    }));
});

/*
 * The marketplace shape the Cron resource exists for: a shared project publishes a bot, and each
 * customer project links to it. The bot crosses that link; the identity the run assumes never does.
 */
describe('Cron across linked projects', () => {
  let systemRepo: SystemRepository;
  let sharedProject: WithId<Project>;
  let sharedBot: WithId<Bot>;
  let customerProject: WithId<Project>;
  let customerRepo: Repository;
  let customerMembership: WithId<ProjectMembership>;

  // Mirrors the repo `getRepoForLogin` builds for a project that links another
  function customerRepoFor(customer: TestProjectResult<{ withClient: true }>, linked: WithId<Project>): Repository {
    return new Repository({
      extendedMode: true,
      strictMode: true,
      projects: [customer.project, linked],
      author: createReference(customer.client),
    });
  }

  async function linkedCustomer(
    linked: WithId<Project>
  ): Promise<{ project: WithId<Project>; repo: Repository; membership: WithId<ProjectMembership> }> {
    const customer = await createTestProject({
      withClient: true,
      project: { features: ['cron', 'bots'], link: [{ project: createReference(linked) }] },
    });
    const repo = customerRepoFor(customer, linked);
    const membership = await withTestContext(() =>
      systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(customer.project),
        user: createReference(sharedBot),
        profile: createReference(sharedBot),
      })
    );
    return { project: customer.project, repo, membership };
  }

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const shared = await createTestProject({ withClient: true });
    sharedProject = shared.project;
    const sharedRepo = new Repository({
      extendedMode: true,
      projects: [shared.project],
      author: createReference(shared.client),
    });
    systemRepo = sharedRepo.getSystemRepo();
    sharedBot = await withTestContext(() =>
      sharedRepo.createResource<Bot>({ resourceType: 'Bot', name: 'marketplace-bot' })
    );

    const customer = await linkedCustomer(sharedProject);
    customerProject = customer.project;
    customerRepo = customer.repo;
    customerMembership = customer.membership;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function validCron(): Cron {
    return {
      resourceType: 'Cron',
      active: true,
      cronString: '* * * * *',
      onBehalfOf: createReference(customerMembership),
      targetReference: createReference(sharedBot),
    };
  }

  test('Runs a linked bot under the customer membership', () =>
    withTestContext(async () => {
      const cron = await customerRepo.createResource<Cron>(validCron());

      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);
      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).toHaveBeenCalledTimes(1);
      const args = executeBotSpy.mock.calls[0][0];
      // The bot is the shared project's code, run with the customer's authority
      expect(args.bot.id).toStrictEqual(sharedBot.id);
      expect(args.bot.meta?.project).toStrictEqual(sharedProject.id);
      expect(args.runAs.id).toStrictEqual(customerMembership.id);
      expect(resolveId(args.runAs.project)).toStrictEqual(customerProject.id);
      executeBotSpy.mockRestore();
    }));

  test('Files the bot input under the customer project, not the publisher', () =>
    withTestContext(async () => {
      const customer = await linkedCustomer(sharedProject);
      const cron = await customer.repo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        cronString: '* * * * *',
        onBehalfOf: createReference(customer.membership),
        targetReference: createReference(sharedBot),
        parameter: [{ name: 'mrn', valueString: 'A123' }],
      });

      const writeFileSpy = vi.spyOn(getBinaryStorage(), 'writeFile');
      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      const [key, , body] = writeFileSpy.mock.calls[0];
      expect(key).toStrictEqual(expect.stringContaining(`bot/${customer.project.id}/`));
      expect(JSON.parse(body as string)).toMatchObject({
        botId: sharedBot.id,
        projectId: customer.project.id,
        botProjectId: sharedProject.id,
        input: { parameter: [{ name: 'mrn', valueString: 'A123' }] },
      });
      writeFileSpy.mockRestore();
    }));

  test('Rejects an onBehalfOf membership in the linked project', () =>
    withTestContext(async () => {
      // ProjectMembership never crosses a link, so the access policy a run assumes cannot either
      const sharedMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(sharedProject),
        user: createReference(sharedBot),
        profile: createReference(sharedBot),
      });

      await expect(
        customerRepo.createResource<Cron>({ ...validCron(), onBehalfOf: createReference(sharedMembership) })
      ).rejects.toThrow(`Cannot resolve 'ProjectMembership/${sharedMembership.id}'`);
    }));

  test('Rejects a linked bot when the project does not export Bot', () =>
    withTestContext(async () => {
      const closed = await createTestProject({ withClient: true, project: { exportedResourceType: ['Patient'] } });
      const closedRepo = new Repository({
        extendedMode: true,
        projects: [closed.project],
        author: createReference(closed.client),
      });
      const closedBot = await closedRepo.createResource<Bot>({ resourceType: 'Bot', name: 'unexported-bot' });

      const customer = await createTestProject({
        withClient: true,
        project: { features: ['cron'], link: [{ project: createReference(closed.project) }] },
      });
      const repo = customerRepoFor(customer, closed.project);
      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(customer.project),
        user: createReference(closedBot),
        profile: createReference(closedBot),
      });

      await expect(
        repo.createResource<Cron>({
          resourceType: 'Cron',
          active: true,
          cronString: '* * * * *',
          onBehalfOf: createReference(membership),
          targetReference: createReference(closedBot),
        })
      ).rejects.toThrow(`Cannot resolve 'Bot/${closedBot.id}'`);
    }));

  /*
   * The `bots` feature follows onBehalfOf's project, since that is where the run executes and whose
   * data it touches. A shared project only publishes the code, so its own entitlement says nothing.
   */
  test.each([
    [[] as string[], ['bots', 'cron'], false],
    [['bots'], ['cron'], true],
  ])('Publisher features %j, customer features %j -> blocked=%s', (sharedFeatures, customerFeatures, blocked) =>
    withTestContext(async () => {
      const shared = await createTestProject({ withClient: true, project: { features: sharedFeatures as [] } });
      const publisherRepo = new Repository({
        extendedMode: true,
        projects: [shared.project],
        author: createReference(shared.client),
      });
      const bot = await publisherRepo.createResource<Bot>({ resourceType: 'Bot', name: 'published-bot' });

      const customer = await createTestProject({
        withClient: true,
        project: { features: customerFeatures as [], link: [{ project: createReference(shared.project) }] },
      });
      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(customer.project),
        user: createReference(bot),
        profile: createReference(bot),
      });
      const cron = await customerRepoFor(customer, shared.project).createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        cronString: '* * * * *',
        onBehalfOf: createReference(membership),
        targetReference: createReference(bot),
      });

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      const auditEvent = await systemRepo.searchOne<AuditEvent>({
        resourceType: 'AuditEvent',
        filters: [{ code: 'entity', operator: Operator.EQUALS, value: getReferenceString(bot) }],
      });
      expect(auditEvent?.meta?.project).toStrictEqual(customer.project.id);
      if (blocked) {
        expect(auditEvent?.outcomeDesc).toStrictEqual('Bots not enabled');
      } else {
        // Reaching the runtime at all is the point: the publisher's missing feature did not gate it
        expect(auditEvent?.outcomeDesc).toStrictEqual('Unsupported bot runtime');
      }
    })
  );

  test('Unregisters the job when the link is revoked after the Cron was written', () =>
    withTestContext(async () => {
      const customer = await linkedCustomer(sharedProject);
      const cron = await customer.repo.createResource<Cron>({
        resourceType: 'Cron',
        active: true,
        cronString: '* * * * *',
        onBehalfOf: createReference(customer.membership),
        targetReference: createReference(sharedBot),
      });

      // Only a super admin can change link, and nothing re-validates existing Crons when they do
      await systemRepo.updateResource<Project>({ ...customer.project, link: undefined });

      const queue = getCronQueue() as any;
      queue.removeJobScheduler.mockClear();
      const executeBotSpy = vi.spyOn(executeModule, 'executeBot').mockResolvedValue({} as any);

      await execBot({ data: { resourceType: 'Cron', cronId: cron.id } } as Job<CronJobData>);

      expect(executeBotSpy).not.toHaveBeenCalled();
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`Cron/${cron.id}`);
      executeBotSpy.mockRestore();
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

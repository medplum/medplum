// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  accepted,
  allOk,
  badRequest,
  forbidden,
  getQueryString,
  getResourceTypes,
  OperationOutcomeError,
  parseSearchRequest,
  SearchRequest,
  validateResourceType,
} from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { assert } from 'console';
import { Request, Response, Router } from 'express';
import { body, checkExact, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { setPassword } from '../auth/setpassword';
import { getConfig } from '../config/loader';
import { AuthenticatedRequestContext, getAuthenticatedContext } from '../context';
import { DatabaseMode, getDatabasePool } from '../database';
import { AsyncJobExecutor, sendAsyncResponse } from '../fhir/operations/utils/asyncjobexecutor';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { markPostDeployMigrationCompleted } from '../migration-sql';
import { generateMigrationActions } from '../migrations/migrate';
import { getPendingPostDeployMigration, maybeStartPostDeployMigration } from '../migrations/migration-utils';
import { getPostDeployMigrationVersions } from '../migrations/migration-versions';
import { authenticateRequest } from '../oauth/middleware';
import { getUserByEmail } from '../oauth/utils';
import { rebuildR4SearchParameters } from '../seeds/searchparameters';
import { rebuildR4StructureDefinitions } from '../seeds/structuredefinitions';
import { rebuildR4ValueSets } from '../seeds/valuesets';
import { reloadCronBots, removeBullMQJobByKey } from '../workers/cron';
import { addPostDeployMigrationJobData, prepareDynamicMigrationJobData } from '../workers/post-deploy-migration';
import { addReindexJob } from '../workers/reindex';

export const OVERRIDABLE_TABLE_SETTINGS = {
  autovacuum_vacuum_scale_factor: 'float',
  autovacuum_analyze_scale_factor: 'float',
  autovacuum_vacuum_threshold: 'int',
  autovacuum_analyze_threshold: 'int',
  autovacuum_vacuum_cost_limit: 'int',
  autovacuum_vacuum_cost_delay: 'float',
} as const satisfies Record<string, 'float' | 'int'>;

export function isValidTableName(tableName: string): boolean {
  return /^[\w_]+$/.test(tableName);
}

export const superAdminRouter = Router();
superAdminRouter.use(authenticateRequest);

// POST to /admin/super/valuesets
// to rebuild the terminology tables.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post(
  '/valuesets',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    const systemRepo = getSystemRepo();
    await sendAsyncResponse(req, res, async () => rebuildR4ValueSets(systemRepo));
  })
);

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post(
  '/structuredefinitions',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    const systemRepo = getSystemRepo();
    await sendAsyncResponse(req, res, async () => rebuildR4StructureDefinitions(systemRepo));
  })
);

// POST to /admin/super/searchparameters
// to rebuild the "SearchParameter" table.
// Run this after any changes to the built-in SearchParameters.
superAdminRouter.post(
  '/searchparameters',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    const systemRepo = getSystemRepo();
    await sendAsyncResponse(req, res, async () => rebuildR4SearchParameters(systemRepo));
  })
);

// POST to /admin/super/reindex
// to reindex a single resource type.
// Run this after major changes to how search columns are constructed.
superAdminRouter.post(
  '/reindex',

  [
    body('reindexType')
      .isIn(['outdated', 'all', 'specific'])
      .withMessage('reindexType must be "outdated", "all", or "specific"'),
    body('maxResourceVersion')
      .if(body('reindexType').equals('specific'))
      .isInt({ min: 0, max: Repository.VERSION - 1 })
      .withMessage(`maxResourceVersion must be an integer from 0 to ${Repository.VERSION - 1}`),
    body('maxResourceVersion')
      .if(body('reindexType').not().equals('specific'))
      .isEmpty()
      .withMessage('maxResourceVersion should only be specified when reindexType is "specific"'),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    let resourceTypes: string[];
    if (req.body.resourceType === '*') {
      resourceTypes = getResourceTypes().filter((rt) => rt !== 'Binary');
    } else {
      resourceTypes = (req.body.resourceType as string).split(',').map((t) => t.trim());
      for (const resourceType of resourceTypes) {
        validateResourceType(resourceType);
      }
    }

    let searchFilter: SearchRequest | undefined;
    const filter = req.body.filter as string;
    if (filter) {
      searchFilter = parseSearchRequest((resourceTypes[0] ?? '') + '?' + filter);
    }

    const systemRepo = getSystemRepo();

    const reindexType = req.body.reindexType as 'outdated' | 'all' | 'specific';
    let maxResourceVersion: number | undefined;
    switch (reindexType) {
      case 'all':
        maxResourceVersion = undefined;
        break;
      case 'specific':
        maxResourceVersion = Number(req.body.maxResourceVersion);
        break;
      case 'outdated':
        maxResourceVersion = Repository.VERSION - 1;
        break;
      default:
        reindexType satisfies never;
        sendOutcome(res, badRequest(`Invalid reindex type: ${reindexType}`));
        return;
    }

    // construct a representation of the inputs/parameters for the reindex job
    // for human consumption in `AsyncJob.request`
    const queryForUrl: Record<string, string> = {
      resourceType: req.body.resourceType,
      filter: req.body.filter,
      reindexType,
      maxResourceVersion: maxResourceVersion?.toString() ?? '',
    };

    const asyncJobUrl = new URL(`${req.protocol}://${req.get('host') + req.originalUrl}`);
    // replace the search, if any, with queryForUrl
    asyncJobUrl.search = getQueryString(queryForUrl);

    const exec = new AsyncJobExecutor(systemRepo);
    await exec.init(asyncJobUrl.toString());
    await exec.run(async (asyncJob) => {
      await addReindexJob(resourceTypes as ResourceType[], asyncJob, searchFilter, maxResourceVersion);
    });

    const { baseUrl } = getConfig();
    sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
  })
);

// POST to /admin/super/setpassword
// to force set a User password.
superAdminRouter.post(
  '/setpassword',
  [
    body('email').isEmail().withMessage('Valid email address is required'),
    body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const user = await getUserByEmail(req.body.email, req.body.projectId);
    if (!user) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }

    await setPassword(user, req.body.password as string);
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/purge
// to clean up old system generated resources.
superAdminRouter.post(
  '/purge',
  [
    body('resourceType').isIn(['AuditEvent', 'Login']).withMessage('Invalid resource type'),
    body('before').isISO8601().withMessage('Invalid before date'),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = requireSuperAdmin();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    await ctx.repo.purgeResources(req.body.resourceType, req.body.before);
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/removebotidjobsfromqueue
// to remove bot id jobs from queue.
superAdminRouter.post(
  '/removebotidjobsfromqueue',
  [body('botId').notEmpty().withMessage('Bot ID is required')],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    await removeBullMQJobByKey(req.body.botId);

    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/rebuildprojectid
// to rebuild the projectId column on all resource types.
superAdminRouter.post(
  '/rebuildprojectid',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    await sendAsyncResponse(req, res, async () => {
      const resourceTypes = getResourceTypes();
      for (const resourceType of resourceTypes) {
        await getDatabasePool(DatabaseMode.WRITER).query(
          `UPDATE "${resourceType}" SET "projectId"="compartments"[1] WHERE "compartments" IS NOT NULL AND cardinality("compartments")>0`
        );
      }
    });
  })
);

superAdminRouter.get(
  '/migrations',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();

    const postDeployMigrations = getPostDeployMigrationVersions();
    const conn = await getDatabasePool(DatabaseMode.WRITER);
    const pendingPostDeployMigration = await getPendingPostDeployMigration(conn);

    res.json({
      postDeployMigrations,
      pendingPostDeployMigration,
    });
  })
);

// POST to /admin/super/migrate
// to run pending data migrations.
// This is intended to replace all of the above endpoints,
// because it will be run automatically by the server upgrade process.
superAdminRouter.post(
  '/migrate',
  [body('dataVersion').isInt().withMessage('dataVersion must be an integer').optional()],
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = requireSuperAdmin();
    requireAsync(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const { baseUrl } = getConfig();
    const dataMigrationJob = await maybeStartPostDeployMigration(req?.body?.dataVersion as number | undefined);
    // If there is no migration job to run, return allOk
    if (!dataMigrationJob) {
      sendOutcome(res, allOk);
      return;
    }
    const exec = new AsyncJobExecutor(ctx.repo, dataMigrationJob);
    sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
  })
);

superAdminRouter.post(
  '/reconcile-db-schema-drift',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = requireSuperAdmin();
    requireAsync(req);

    const migrationActions = await generateMigrationActions({
      dbClient: getDatabasePool(DatabaseMode.WRITER),
      dropUnmatchedIndexes: true,
      allowPostDeployActions: true,
    });

    if (migrationActions.length === 0) {
      // Nothing to do
      sendOutcome(res, allOk);
      return;
    }

    const exec = new AsyncJobExecutor(ctx.repo);
    await exec.init(req.originalUrl);
    await exec.run(async (asyncJob) => {
      const jobData = prepareDynamicMigrationJobData(asyncJob, migrationActions);
      await addPostDeployMigrationJobData(jobData);
    });

    const { baseUrl } = getConfig();
    sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
  })
);

// POST to /admin/super/setdataversion
// to set the data version of the database.
// This is intended to allow you to set the data version and skip over a data migration YOUR ARE SURE you do not need to apply.
// WARNING: This is unsafe and may break everything if you are not careful.
superAdminRouter.post(
  '/setdataversion',
  [body('dataVersion').isInt().withMessage('dataVersion must be an integer')],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    assert(req.body.dataVersion !== undefined);
    await markPostDeployMigrationCompleted(getDatabasePool(DatabaseMode.WRITER), req.body.dataVersion);

    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/tablesettings
// to set table settings.
superAdminRouter.post(
  '/tablesettings',
  [
    body('tableName')
      .isString()
      .withMessage('Table name must be a string')
      .custom(isValidTableName)
      .withMessage('Table name must be a snake_cased_string'),
    body('settings')
      .isObject()
      .withMessage('Settings must be object mapping valid table settings to desired values')
      .custom((settings) => {
        for (const settingName of Object.keys(settings)) {
          const dataType = OVERRIDABLE_TABLE_SETTINGS[settingName as keyof typeof OVERRIDABLE_TABLE_SETTINGS];
          if (!dataType) {
            throw new Error(`${settingName} is not a valid table setting`);
          }
        }
        return true;
      }),
    ...Object.entries(OVERRIDABLE_TABLE_SETTINGS).map(([settingName, dataType]) => {
      switch (dataType) {
        case 'float':
          return body(`settings.${settingName}`)
            .isFloat()
            .withMessage(`settings.${settingName} must be a float value`)
            .optional();
        case 'int':
          return body(`settings.${settingName}`)
            .isInt()
            .withMessage(`settings.${settingName} must be an integer value`)
            .optional();
        default:
          throw new Error('Unreachable');
      }
    }),
    checkExact(),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const query = `ALTER TABLE "${req.body.tableName}" SET (${Object.entries(req.body.settings)
      .map(([settingName, val]) => `${settingName} = ${val}`)
      .join(', ')});`;

    const startTime = Date.now();
    await getSystemRepo().getDatabaseClient(DatabaseMode.WRITER).query(query);
    globalLogger.info('[Super Admin]: Table settings updated', {
      tableName: req.body.tableName,
      settings: req.body.settings,
      query,
      durationMs: Date.now() - startTime,
    });
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/vacuum
// to vacuum and optional analyze on one or more tables
superAdminRouter.post(
  '/vacuum',
  [
    body('tableNames').isArray().withMessage('Table names must be an array of strings').optional(),
    body('tableNames.*')
      .isString()
      .withMessage('Table name(s) must be a string')
      .custom(isValidTableName)
      .withMessage('Table name(s) must be a snake_cased_string')
      .optional(),
    body('analyze').isBoolean().optional().default(false),
    body('vacuum').isBoolean().optional().default(true),
    checkExact(),
  ],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const vacuum = req.body.vacuum ?? true;

    let action = vacuum ? 'VACUUM' : '';
    action += req.body.analyze ? ' ANALYZE' : '';
    if (!action) {
      throw new OperationOutcomeError(badRequest('At least one of vacuum or analyze must be true'));
    }

    const query =
      `${action}${req.body.tableNames?.length ? ` ${req.body.tableNames.map((name: string) => `"${name}"`).join(', ')}` : ''};`.trim();

    await sendAsyncResponse(req, res, async () => {
      const startTime = Date.now();
      await getSystemRepo().getDatabaseClient(DatabaseMode.WRITER).query(query);
      globalLogger.info('[Super Admin]: Vacuum completed', {
        tableNames: req.body.tableNames,
        vacuum,
        analyze: req.body.analyze,
        query,
        durationMs: Date.now() - startTime,
      });
      return {
        resourceType: 'Parameters',
        parameter: [
          { name: 'outcome', resource: allOk },
          { name: 'query', valueString: query },
        ],
      };
    });
  })
);

// POST to /admin/super/reloadcron
// to clear out the cron queue and reload all cron strings from cron bots
superAdminRouter.post(
  '/reloadcron',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    await sendAsyncResponse(req, res, async () => {
      const startTime = Date.now();
      await reloadCronBots();
      globalLogger.info('[Super Admin]: Cron bots reloaded', {
        durationMs: Date.now() - startTime,
      });
      return {
        resourceType: 'Parameters',
        parameter: [{ name: 'outcome', resource: allOk }],
      };
    });
  })
);

export function requireSuperAdmin(): AuthenticatedRequestContext {
  const ctx = getAuthenticatedContext();
  if (!ctx.project.superAdmin) {
    throw new OperationOutcomeError(forbidden);
  }
  return ctx;
}

function requireAsync(req: Request): void {
  if (req.header('Prefer') !== 'respond-async') {
    throw new OperationOutcomeError(badRequest('Operation requires "Prefer: respond-async"'));
  }
}

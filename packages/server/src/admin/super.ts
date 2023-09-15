import {
  accepted,
  allOk,
  badRequest,
  forbidden,
  getResourceTypes,
  OperationOutcomeError,
  validateResourceType,
} from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { setPassword } from '../auth/setpassword';
import { getConfig } from '../config';
import { getClient } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { Repository, systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import * as dataMigrations from '../migrations/data';
import { authenticateToken } from '../oauth/middleware';
import { getUserByEmail } from '../oauth/utils';
import { rebuildR4SearchParameters } from '../seeds/searchparameters';
import { rebuildR4StructureDefinitions } from '../seeds/structuredefinitions';
import { rebuildR4ValueSets } from '../seeds/valuesets';
import { removeBullMQJobByKey } from '../workers/cron';

export const superAdminRouter = Router();
superAdminRouter.use(authenticateToken);

// POST to /admin/super/valuesets
// to rebuild the "ValueSetElements" table.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post(
  '/valuesets',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    await sendAsyncResponse(req, res, () => rebuildR4ValueSets());
  })
);

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post(
  '/structuredefinitions',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    await sendAsyncResponse(req, res, () => rebuildR4StructureDefinitions());
  })
);

// POST to /admin/super/searchparameters
// to rebuild the "SearchParameter" table.
// Run this after any changes to the built-in SearchParameters.
superAdminRouter.post(
  '/searchparameters',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    await sendAsyncResponse(req, res, () => rebuildR4SearchParameters());
  })
);

// POST to /admin/super/reindex
// to reindex a single resource type.
// Run this after major changes to how search columns are constructed.
superAdminRouter.post(
  '/reindex',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    const resourceType = req.body.resourceType;
    validateResourceType(resourceType);

    await sendAsyncResponse(req, res, async () => {
      await systemRepo.reindexResourceType(resourceType);
    });
  })
);

// POST to /admin/super/compartments
// to rebuild compartments for a resource type.
// Run this after major changes to how compartments are constructed.
superAdminRouter.post(
  '/compartments',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    const resourceType = req.body.resourceType;
    validateResourceType(resourceType);

    await sendAsyncResponse(req, res, async () => {
      await systemRepo.rebuildCompartmentsForResourceType(resourceType);
    });
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
    requireSuperAdmin(res);

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
    requireSuperAdmin(res);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const repo = res.locals.repo as Repository;
    await repo.purgeResources(req.body.resourceType, req.body.before);
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/removebotidjobsfromqueue
// to remove bot id jobs from queue.
superAdminRouter.post(
  '/removebotidjobsfromqueue',
  [body('botId').notEmpty().withMessage('Bot ID is required')],
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);

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
    requireSuperAdmin(res);
    requireAsync(req);

    await sendAsyncResponse(req, res, async () => {
      const resourceTypes = getResourceTypes();
      for (const resourceType of resourceTypes) {
        await getClient().query(
          `UPDATE "${resourceType}" SET "projectId"="compartments"[1] WHERE "compartments" IS NOT NULL AND cardinality("compartments")>0`
        );
      }
    });
  })
);

// POST to /admin/super/migrate
// to run pending data migrations.
// This is intended to replace all of the above endpoints,
// because it will be run automatically by the server upgrade process.
superAdminRouter.post(
  '/migrate',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin(res);
    requireAsync(req);

    await sendAsyncResponse(req, res, async () => {
      const client = getClient();
      const result = await client.query('SELECT "dataVersion" FROM "DatabaseMigration"');
      const version = result.rows[0]?.dataVersion as number;
      const migrationKeys = Object.keys(dataMigrations);
      for (let i = version + 1; i <= migrationKeys.length; i++) {
        const migration = (dataMigrations as Record<string, dataMigrations.Migration>)['v' + i];
        logger.info('Running data migration', { version: `v${i}` });
        await migration.run(systemRepo);
        await client.query('UPDATE "DatabaseMigration" SET "dataVersion"=$1', [i]);
      }
    });
  })
);

function requireSuperAdmin(res: Response): void {
  if (!res.locals.login.superAdmin) {
    throw new OperationOutcomeError(forbidden);
  }
}

function requireAsync(req: Request): void {
  if (req.header('Prefer') !== 'respond-async') {
    throw new OperationOutcomeError(badRequest('Operation requires "Prefer: respond-async"'));
  }
}

async function sendAsyncResponse(req: Request, res: Response, callback: () => Promise<any>): Promise<void> {
  const { baseUrl } = getConfig();
  const repo = res.locals.repo as Repository;
  const exec = new AsyncJobExecutor(repo);
  await exec.init(req.protocol + '://' + req.get('host') + req.originalUrl);
  exec.start(callback);
  sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
}

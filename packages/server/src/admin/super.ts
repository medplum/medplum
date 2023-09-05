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
import { systemRepo } from '../fhir/repo';
import { authenticateToken } from '../oauth/middleware';
import { getUserByEmail } from '../oauth/utils';
import { createSearchParameters } from '../seeds/searchparameters';
import { createStructureDefinitions } from '../seeds/structuredefinitions';
import { createValueSets } from '../seeds/valuesets';
import { removeBullMQJobByKey } from '../workers/cron';
import { getRequestContext } from '../app';

export const superAdminRouter = Router();
superAdminRouter.use(authenticateToken);

// POST to /admin/super/valuesets
// to rebuild the "ValueSetElements" table.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post(
  '/valuesets',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
    requireAsync(req);

    await sendAsyncResponse(req, res, createValueSets);
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

    await sendAsyncResponse(req, res, createStructureDefinitions);
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

    await sendAsyncResponse(req, res, createSearchParameters);
  })
);

// POST to /admin/super/reindex
// to reindex a single resource type.
// Run this after major changes to how search columns are constructed.
superAdminRouter.post(
  '/reindex',
  asyncWrap(async (req: Request, res: Response) => {
    requireSuperAdmin();
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
    requireSuperAdmin();
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
    const ctx = getRequestContext();
    requireSuperAdmin();

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
        await getClient().query(
          `UPDATE "${resourceType}" SET "projectId"="compartments"[1] WHERE "compartments" IS NOT NULL AND cardinality("compartments")>0`
        );
      }
    });
  })
);

function requireSuperAdmin(): void {
  if (!getRequestContext().login.superAdmin) {
    throw new OperationOutcomeError(forbidden);
  }
}

function requireAsync(req: Request): void {
  if (req.header('Prefer') !== 'respond-async') {
    throw new OperationOutcomeError(badRequest('Operation requires "Prefer: respond-async"'));
  }
}

async function sendAsyncResponse(req: Request, res: Response, callback: () => Promise<any>): Promise<void> {
  const ctx = getRequestContext();
  const { baseUrl } = getConfig();
  const exec = new AsyncJobExecutor(ctx.repo);
  await exec.init(req.protocol + '://' + req.get('host') + req.originalUrl);
  exec.start(callback);
  sendOutcome(res, accepted(exec.getContentLocation(baseUrl)));
}

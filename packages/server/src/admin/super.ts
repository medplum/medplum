import { allOk, badRequest, forbidden, validateResourceType } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { setPassword } from '../auth/setpassword';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { Repository, systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { authenticateToken } from '../oauth/middleware';
import { getUserByEmail } from '../oauth/utils';
import { createSearchParameters } from '../seeds/searchparameters';
import { createStructureDefinitions } from '../seeds/structuredefinitions';
import { createValueSets } from '../seeds/valuesets';

export const superAdminRouter = Router();
superAdminRouter.use(authenticateToken);

// POST to /admin/super/valuesets
// to rebuild the "ValueSetElements" table.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post(
  '/valuesets',
  asyncWrap(async (_req: Request, res: Response) => {
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

    await createValueSets();
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post(
  '/structuredefinitions',
  asyncWrap(async (_req: Request, res: Response) => {
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

    await createStructureDefinitions();
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/searchparameters
// to rebuild the "SearchParameter" table.
// Run this after any changes to the built-in SearchParameters.
superAdminRouter.post(
  '/searchparameters',
  asyncWrap(async (_req: Request, res: Response) => {
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

    await createSearchParameters();
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/reindex
// to reindex a single resource type.
// Run this after major changes to how search columns are constructed.
superAdminRouter.post(
  '/reindex',
  asyncWrap(async (req: Request, res: Response) => {
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

    const resourceType = req.body.resourceType;
    validateResourceType(resourceType);

    // Start reindex in the background
    // This can take a long time, so we don't want to block the response
    systemRepo
      .reindexResourceType(resourceType)
      .then(() => logger.info(`Reindexing ${resourceType} completed`))
      .catch((err) => logger.error(`Reindexing ${resourceType} failed: ${err}`));

    sendOutcome(res, allOk);
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
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

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
    if (!res.locals.login.superAdmin) {
      sendOutcome(res, forbidden);
      return;
    }

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

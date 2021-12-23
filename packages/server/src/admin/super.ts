import { accessDenied, allOk, assertOk, isOk } from '@medplum/core';
import { User } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { systemRepo, sendOutcome, validateResourceType } from '../fhir';
import { authenticateToken } from '../oauth';
import { createStructureDefinitions } from '../seeds/structuredefinitions';
import { createValueSetElements } from '../seeds/valuesets';

export const superAdminRouter = Router();
superAdminRouter.use(authenticateToken);

// POST to /admin/super/valuesets
// to rebuild the "ValueSetElements" table.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post(
  '/valuesets',
  asyncWrap(async (req: Request, res: Response) => {
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome);

    if (!user?.admin) {
      return sendOutcome(res, accessDenied);
    }

    await createValueSetElements();
    return sendOutcome(res, allOk);
  })
);

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post(
  '/structuredefinitions',
  asyncWrap(async (req: Request, res: Response) => {
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome);

    if (!user?.admin) {
      return sendOutcome(res, accessDenied);
    }

    await createStructureDefinitions();
    return sendOutcome(res, allOk);
  })
);

// POST to /admin/super/reindex
// to reindex a single resource type.
// Run this after major changes to how search columns are constructed.
superAdminRouter.post(
  '/reindex',
  asyncWrap(async (req: Request, res: Response) => {
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome);

    if (!user?.admin) {
      return sendOutcome(res, accessDenied);
    }

    const resourceType = req.body.resourceType;
    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      return sendOutcome(res, validateOutcome);
    }

    const [reindexOutcome] = await systemRepo.reindexResourceType(resourceType);
    return sendOutcome(res, reindexOutcome);
  })
);

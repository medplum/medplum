import { accessDenied, allOk, assertOk, isOk } from '@medplum/core';
import { User } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome, systemRepo, validateResourceType } from '../fhir';
import { authenticateToken } from '../oauth';
import { createSearchParameters } from '../seeds/searchparameters';
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
    assertOk(outcome, user);

    if (!user.admin) {
      sendOutcome(res, accessDenied);
      return;
    }

    await createValueSetElements();
    sendOutcome(res, allOk);
  })
);

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post(
  '/structuredefinitions',
  asyncWrap(async (req: Request, res: Response) => {
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome, user);

    if (!user.admin) {
      sendOutcome(res, accessDenied);
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
  asyncWrap(async (req: Request, res: Response) => {
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome, user);

    if (!user.admin) {
      sendOutcome(res, accessDenied);
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
    const [outcome, user] = await systemRepo.readResource<User>('User', res.locals.user);
    assertOk(outcome, user);

    if (!user.admin) {
      sendOutcome(res, accessDenied);
      return;
    }

    const resourceType = req.body.resourceType;
    const validateOutcome = validateResourceType(resourceType);
    if (!isOk(validateOutcome)) {
      sendOutcome(res, validateOutcome);
      return;
    }

    const [reindexOutcome] = await systemRepo.reindexResourceType(resourceType);
    sendOutcome(res, reindexOutcome);
  })
);

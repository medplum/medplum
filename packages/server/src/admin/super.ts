import { allOk, assertOk, badRequest, User } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { repo, sendOutcome } from '../fhir';
import { authenticateToken } from '../oauth';
import { createStructureDefinitions } from '../seeds/structuredefinitions';
import { createValueSetElements } from '../seeds/valuesets';

export const superAdminRouter = Router();
superAdminRouter.use(authenticateToken);

// POST to /admin/super/valuesets
// to rebuild the "ValueSetElements" table.
// Run this after changes to how ValueSet elements are defined.
superAdminRouter.post('/valuesets', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, user] = await repo.readResource<User>('User', res.locals.user);
  assertOk(outcome);

  if (!user?.admin) {
    return sendOutcome(res, badRequest('Requires super administrator privileges'));
  }

  await createValueSetElements();
  return sendOutcome(res, allOk);
}));

// POST to /admin/super/structuredefinitions
// to rebuild the "StructureDefinition" table.
// Run this after any changes to the built-in StructureDefinitions.
superAdminRouter.post('/structuredefinitions', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, user] = await repo.readResource<User>('User', res.locals.user);
  assertOk(outcome);

  if (!user?.admin) {
    return sendOutcome(res, badRequest('Requires super administrator privileges'));
  }

  await createStructureDefinitions();
  return sendOutcome(res, allOk);
}));

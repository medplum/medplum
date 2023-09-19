import { Request, Response, Router } from 'express';
import { verifyProjectAdmin } from '../admin/utils';
import { asyncWrap } from '../async';
import { authenticateRequest } from '../oauth/middleware';
import { createScimUser, deleteScimUser, readScimUser, searchScimUsers, updateScimUser } from './utils';
import { Reference, User } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../context';

export const scimRouter = Router();
scimRouter.use(authenticateRequest);
scimRouter.use(verifyProjectAdmin);

// SCIM
// http://www.simplecloud.info/

scimRouter.get(
  '/Users',
  asyncWrap(async (_req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await searchScimUsers(ctx.project);
    res.status(200).json(result);
  })
);

scimRouter.post(
  '/Users',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    // TODO: Fix this value
    const result = await createScimUser(ctx.login.user as Reference<User>, ctx.project, req.body);
    res.status(201).json(result);
  })
);

scimRouter.get(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await readScimUser(ctx.project, req.params.id);
    res.status(200).json(result);
  })
);

scimRouter.put(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await updateScimUser(ctx.project, req.body);
    res.status(200).json(result);
  })
);

scimRouter.delete(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    await deleteScimUser(ctx.project, req.params.id);
    res.sendStatus(204);
  })
);

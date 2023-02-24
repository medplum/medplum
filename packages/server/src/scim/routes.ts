import { Request, Response, Router } from 'express';
import { verifyProjectAdmin } from '../admin/utils';
import { asyncWrap } from '../async';
import { authenticateToken } from '../oauth/middleware';
import { createScimUser, deleteScimUser, readScimUser, searchScimUsers, updateScimUser } from './utils';

export const scimRouter = Router();
scimRouter.use(authenticateToken);
scimRouter.use(verifyProjectAdmin);

// SCIM
// http://www.simplecloud.info/

scimRouter.get(
  '/Users',
  asyncWrap(async (_req: Request, res: Response) => {
    const result = await searchScimUsers(res.locals.project);
    res.status(200).json(result);
  })
);

scimRouter.post(
  '/Users',
  asyncWrap(async (req: Request, res: Response) => {
    const result = await createScimUser(res.locals.user, res.locals.project, req.body);
    res.status(201).json(result);
  })
);

scimRouter.get(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const result = await readScimUser(res.locals.project, req.params.id);
    res.status(200).json(result);
  })
);

scimRouter.put(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    const result = await updateScimUser(res.locals.project, req.body);
    res.status(200).json(result);
  })
);

scimRouter.delete(
  '/Users/:id',
  asyncWrap(async (req: Request, res: Response) => {
    await deleteScimUser(res.locals.project, req.params.id);
    res.sendStatus(204);
  })
);

import { getStatus, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import { Reference, User } from '@medplum/fhirtypes';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { verifyProjectAdmin } from '../admin/utils';
import { getAuthenticatedContext } from '../context';
import { authenticateRequest } from '../oauth/middleware';
import { createScimUser, deleteScimUser, readScimUser, searchScimUsers, updateScimUser } from './utils';

// SCIM
// http://www.simplecloud.info/

export const scimRouter = Router();
scimRouter.use(authenticateRequest);
scimRouter.use(verifyProjectAdmin);

scimRouter.get(
  '/Users',
  scimWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await searchScimUsers(ctx.project, req.query as Record<string, string>);
    res.status(200).json(result);
  })
);

scimRouter.post(
  '/Users',
  scimWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    // TODO: Fix this value
    const result = await createScimUser(ctx.login.user as Reference<User>, ctx.project, req.body);
    res.status(201).json(result);
  })
);

scimRouter.get(
  '/Users/:id',
  scimWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await readScimUser(ctx.project, req.params.id);
    res.status(200).json(result);
  })
);

scimRouter.put(
  '/Users/:id',
  scimWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await updateScimUser(ctx.project, req.body);
    res.status(200).json(result);
  })
);

scimRouter.delete(
  '/Users/:id',
  scimWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    await deleteScimUser(ctx.project, req.params.id);
    res.sendStatus(204);
  })
);

function scimWrap(callback: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return function (req: Request, res: Response, next: NextFunction): void {
    callback(req, res, next).catch((err) => {
      sendScimError(res, err);
      next();
    });
  };
}

function sendScimError(res: Response, err: unknown): void {
  const outcome = normalizeOperationOutcome(err);

  // SCIM 2.0 error response
  // See: https://datatracker.ietf.org/doc/html/rfc7644#section-3.12
  res.status(getStatus(outcome)).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: getStatus(outcome).toString(),
    detail: normalizeErrorString(outcome),
  });
}

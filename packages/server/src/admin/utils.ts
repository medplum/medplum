import { forbidden, OperationOutcomeError } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';

/**
 * Verifies that the current user is a project admin.
 * @param req The request.
 * @param res The response.
 * @param next The next handler function.
 */
export async function verifyProjectAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const membership = res.locals.membership as ProjectMembership;
  if (!membership.admin) {
    next(new OperationOutcomeError(forbidden));
    return;
  }

  next();
}

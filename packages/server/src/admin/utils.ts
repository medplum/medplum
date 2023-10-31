import { forbidden, OperationOutcomeError } from '@medplum/core';
import { NextFunction, Request, Response } from 'express';
import { getAuthenticatedContext } from '../context';

/**
 * Verifies that the current user is a project admin.
 * @param req - The request.
 * @param res - The response.
 * @param next - The next handler function.
 */
export async function verifyProjectAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = getAuthenticatedContext();
  if (ctx.project.superAdmin || ctx.membership.admin) {
    next();
  } else {
    next(new OperationOutcomeError(forbidden));
  }
}

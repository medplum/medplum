import { allOk, badRequest } from '@medplum/core';
import { Reference, User, UserSecurityRequest } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { timingSafeEqualStr } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';

export const verifyEmailValidator = makeValidationMiddleware([
  body('id').isUUID().withMessage('Invalid request ID'),
  body('secret').notEmpty().withMessage('Missing secret'),
]);

export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const systemRepo = getSystemRepo();
  const pcr = await systemRepo.readResource<UserSecurityRequest>('UserSecurityRequest', req.body.id);

  if (pcr.type !== 'verify-email') {
    sendOutcome(res, badRequest('Invalid user security request type'));
    return;
  }

  if (pcr.used) {
    sendOutcome(res, badRequest('Already used'));
    return;
  }

  if (!timingSafeEqualStr(pcr.secret as string, req.body.secret)) {
    sendOutcome(res, badRequest('Incorrect secret'));
    return;
  }

  const user = await systemRepo.readReference(pcr.user as Reference<User>);

  await systemRepo.withTransaction(async () => {
    await systemRepo.updateResource<User>({ ...user, emailVerified: true });
    await systemRepo.updateResource<UserSecurityRequest>({ ...pcr, used: true });
  });

  sendOutcome(res, allOk);
}

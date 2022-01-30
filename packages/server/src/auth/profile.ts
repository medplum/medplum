import { assertOk, badRequest, createReference } from '@medplum/core';
import { Login, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { getUserMemberships } from '../oauth';

/*
 * The profile handler is used during login when a user has multiple profiles.
 * The client will submit the profile id and the server will update the login.
 */

export const profileValidators = [
  body('login').exists().withMessage('Missing login'),
  body('profile').exists().withMessage('Missing profile'),
];

export async function profileHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', req.body.login);
  assertOk(loginOutcome, login);

  if (login.revoked) {
    sendOutcome(res, badRequest('Login revoked'));
    return;
  }

  if (login.granted) {
    sendOutcome(res, badRequest('Login granted'));
    return;
  }

  if (login.membership) {
    sendOutcome(res, badRequest('Login profile already set'));
    return;
  }

  // Find the membership for the user
  const memberships = await getUserMemberships(login?.user as Reference<User>);
  const membership = memberships.find((m) => m.id === req.body.profile);
  if (!membership) {
    sendOutcome(res, badRequest('Profile not found'));
    return;
  }

  // Update the login
  const [updateOutcome, updated] = await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  assertOk(updateOutcome, updated);

  res.status(200).json({
    login: login?.id,
    code: login?.code,
  });
}

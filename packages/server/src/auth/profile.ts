import { assertOk, badRequest, createReference, Login, ProfileResource, Project, Reference, User } from '@medplum/core';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { getUserMemberships } from '../oauth';

export const profileValidators = [
  body('login').exists().withMessage('Missing login'),
  body('profile').exists().withMessage('Missing profile'),
];

export async function profileHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const [loginOutcome, login] = await repo.readResource<Login>('Login', req.body.login);
  assertOk(loginOutcome);

  if (login?.revoked) {
    return sendOutcome(res, badRequest('Login revoked'));
  }

  if (login?.granted) {
    return sendOutcome(res, badRequest('Login granted'));
  }

  if (login?.project || login?.profile) {
    return sendOutcome(res, badRequest('Login profile set'));
  }

  // Find the membership for the user
  const memberships = await getUserMemberships(login?.user as Reference<User>);
  const membership = memberships.find(m => m.id === req.body.profile);
  if (!membership) {
    return sendOutcome(res, badRequest('Profile not found'));
  }

  // Get up-to-date project and profile
  const [projectOutcome, project] = await repo.readReference<Project>(membership.project as Reference<Project>);
  assertOk(projectOutcome);

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(membership.profile as Reference<ProfileResource>);
  assertOk(profileOutcome);

  // Update the login
  const [updateOutcome] = await repo.updateResource({
    ...(login as Login),
    project: createReference(project as Project),
    profile: createReference(profile as ProfileResource),
    accessPolicy: membership.accessPolicy,
  });
  assertOk(updateOutcome);

  return res.status(200).json({
    login: login?.id,
    code: login?.code
  });
}

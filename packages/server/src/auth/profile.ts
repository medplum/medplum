import { assertOk, badRequest, createReference, ProfileResource } from '@medplum/core';
import { Login, Project, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { getUserMemberships } from '../oauth';

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
  assertOk(loginOutcome);

  if (login?.revoked) {
    sendOutcome(res, badRequest('Login revoked'));
    return;
  }

  if (login?.granted) {
    sendOutcome(res, badRequest('Login granted'));
    return;
  }

  if (login?.project || login?.profile) {
    sendOutcome(res, badRequest('Login profile set'));
    return;
  }

  // Find the membership for the user
  const memberships = await getUserMemberships(login?.user as Reference<User>);
  const membership = memberships.find((m) => m.id === req.body.profile);
  if (!membership) {
    sendOutcome(res, badRequest('Profile not found'));
    return;
  }

  // Get up-to-date project and profile
  const [projectOutcome, project] = await systemRepo.readReference<Project>(membership.project as Reference<Project>);
  assertOk(projectOutcome);

  const [profileOutcome, profile] = await systemRepo.readReference<ProfileResource>(
    membership.profile as Reference<ProfileResource>
  );
  assertOk(profileOutcome);

  // Update the login
  const [updateOutcome] = await systemRepo.updateResource({
    ...(login as Login),
    project: createReference(project as Project),
    profile: createReference(profile as ProfileResource),
    accessPolicy: membership.accessPolicy,
  });
  assertOk(updateOutcome);

  res.status(200).json({
    login: login?.id,
    code: login?.code,
  });
}

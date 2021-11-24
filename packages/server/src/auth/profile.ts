import { assertOk, badRequest, BundleEntry, createReference, Login, Operator, ProfileResource, Project, ProjectMembership, Reference } from '@medplum/core';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, repo, sendOutcome } from '../fhir';

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

  const [membershipsOutcome, memberships] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'user',
      operator: Operator.EQUALS,
      value: login?.user?.reference as string
    }]
  });
  assertOk(membershipsOutcome);

  // Find the membership for the user
  let membership: ProjectMembership | undefined = undefined;
  for (const entry of (memberships?.entry as BundleEntry<ProjectMembership>[])) {
    const m = entry.resource as ProjectMembership;
    if (m.profile?.reference === req.body.profile) {
      membership = m;
      break;
    }
  }

  if (!membership) {
    return sendOutcome(res, badRequest('Profile not found'));
  }

  // Get up-to-date project and profile
  const [projectOutcome, project] = await repo.readReference<Project>(membership.project as Reference<Project>);
  assertOk(projectOutcome);

  const [profileOutcome, profile] = await repo.readReference<ProfileResource>(membership.profile as Reference<ProfileResource>);
  assertOk(profileOutcome);

  // Update the login
  const [updateOutcome, updatedLogin] = await repo.updateResource({
    ...(login as Login),
    // project: membership.project,
    // profile: membership.profile,
    project: createReference(project as Project),
    profile: createReference(profile as ProfileResource),
    accessPolicy: membership.accessPolicy,
  });
  assertOk(updateOutcome);

  console.log('Login...');
  console.log(JSON.stringify(updatedLogin, null, 2));
  console.log('Project...');
  console.log(JSON.stringify(project, null, 2));
  console.log('Profile...');
  console.log(JSON.stringify(profile, null, 2));

  return res.status(200).json({
    login: login?.id,
    code: login?.code
  });
}

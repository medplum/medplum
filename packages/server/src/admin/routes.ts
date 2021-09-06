import { allOk, assertOk, badRequest, Bundle, BundleEntry, Operator, Project, ProjectMembership, Reference, User } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { repo, sendOutcome } from '../fhir';
import { authenticateToken } from '../oauth';
import { createValueSetElements } from '../valuesets';
import { inviteHandler, inviteValidators } from './invite';
import { verifyProjectAdmin } from './utils';

export const adminRouter = Router();
adminRouter.use(authenticateToken);
adminRouter.post('/projects/:projectId/invite', inviteValidators, asyncWrap(inviteHandler));

adminRouter.get('/projects', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, bundle] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'user',
      operator: Operator.EQUALS,
      value: 'User/' + res.locals.user
    }]
  });
  assertOk(outcome);

  const memberships = ((bundle as Bundle<ProjectMembership>).entry as BundleEntry<ProjectMembership>[])
    .map(entry => entry.resource as ProjectMembership)
    .filter(membership => membership.admin);

  const projects = [];
  for (const membership of memberships) {
    const [projectOutcome, project] = await repo.readReference<Project>(membership.project as Reference)
    assertOk(projectOutcome);
    projects.push({
      id: project?.id,
      name: project?.name
    });
  }

  res.status(200).json({ projects });
}));

adminRouter.get('/projects/:projectId', asyncWrap(async (req: Request, res: Response) => {
  const projectDetails = await verifyProjectAdmin(req, res);
  if (!projectDetails) {
    return res.sendStatus(404);
  }

  const { project, memberships } = projectDetails;
  const members = [];
  for (const membership of memberships) {
    members.push({
      membershipId: membership.id,
      profile: membership.profile?.reference,
      user: membership.user?.reference,
      name: membership.profile?.display
    });
  }

  res.status(200).json({
    project: {
      id: project?.id,
      name: project?.name
    },
    members
  });
}));

adminRouter.post('/super/valuesets', asyncWrap(async (req: Request, res: Response) => {
  const [outcome, user] = await repo.readResource<User>('User', res.locals.user);
  assertOk(outcome);

  if (!user?.admin) {
    return sendOutcome(res, badRequest('Requires super administrator privileges'));
  }

  await createValueSetElements();
  sendOutcome(res, allOk);
}));

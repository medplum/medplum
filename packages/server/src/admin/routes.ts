import { assertOk, Bundle, BundleEntry, Operator, Project, ProjectMembership, Reference } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { repo } from '../fhir';
import { authenticateToken } from '../oauth';
import { inviteHandler, inviteValidators } from './invite';

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
  const { projectId } = req.params;

  const [projectOutcome, project] = await repo.readResource<Project>('Project', projectId);
  assertOk(projectOutcome);

  const [membershipOutcome, bundle] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'project',
      operator: Operator.EQUALS,
      value: 'Project/' + projectId
    }]
  });
  assertOk(membershipOutcome);

  const memberships = ((bundle as Bundle<ProjectMembership>).entry as BundleEntry<ProjectMembership>[])
    .map(entry => entry.resource as ProjectMembership);

  if (!memberships.find(m => m.user?.reference === 'User/' + res.locals.user && m.admin)) {
    return res.sendStatus(404);
  }

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

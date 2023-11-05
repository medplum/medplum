import { allOk, badRequest, forbidden, getReferenceString } from '@medplum/core';
import { ProjectMembership } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { authenticateRequest } from '../oauth/middleware';
import { createBotHandler, createBotValidator } from './bot';
import { createClientHandler, createClientValidator } from './client';
import { inviteHandler, inviteValidator } from './invite';
import { verifyProjectAdmin } from './utils';
import { getAuthenticatedContext } from '../context';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateRequest);
projectAdminRouter.use(verifyProjectAdmin);
projectAdminRouter.post('/:projectId/bot', createBotValidator, asyncWrap(createBotHandler));
projectAdminRouter.post('/:projectId/client', createClientValidator, asyncWrap(createClientHandler));
projectAdminRouter.post('/:projectId/invite', inviteValidator, asyncWrap(inviteHandler));

/**
 * Handles requests to "/admin/projects/{projectId}"
 * Returns project metadata and a list of members.
 */
projectAdminRouter.get(
  '/:projectId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = getAuthenticatedContext().project;
    return res.status(200).json({
      project: {
        id: project.id,
        name: project.name,
        secret: project.secret,
        site: project.site,
      },
    });
  })
);

projectAdminRouter.post(
  '/:projectId/secrets',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await ctx.repo.updateResource({
      ...ctx.project,
      secret: req.body,
    });

    res.json(result);
  })
);

projectAdminRouter.post(
  '/:projectId/sites',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const result = await ctx.repo.updateResource({
      ...ctx.project,
      site: req.body,
    });

    res.json(result);
  })
);

projectAdminRouter.get(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { membershipId } = req.params;
    const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    if (membership.project?.reference !== getReferenceString(ctx.project)) {
      sendOutcome(res, forbidden);
      return;
    }
    res.json(membership);
  })
);

projectAdminRouter.post(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { membershipId } = req.params;
    const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    if (membership.project?.reference !== getReferenceString(ctx.project)) {
      sendOutcome(res, forbidden);
      return;
    }
    const resource = req.body;
    if (resource?.resourceType !== 'ProjectMembership' || resource.id !== membershipId) {
      sendOutcome(res, forbidden);
      return;
    }
    const result = await systemRepo.updateResource(resource);
    res.json(result);
  })
);

projectAdminRouter.delete(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const { membershipId } = req.params;
    const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    if (membership.project?.reference !== getReferenceString(ctx.project)) {
      sendOutcome(res, forbidden);
      return;
    }

    if (ctx.project.owner?.reference === membership.user?.reference) {
      sendOutcome(res, badRequest('Cannot delete the owner of the project'));
      return;
    }

    await systemRepo.deleteResource('ProjectMembership', req.params.membershipId);
    sendOutcome(res, allOk);
  })
);

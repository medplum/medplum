import { allOk, badRequest, forbidden } from '@medplum/core';
import { Project, ProjectMembership } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { authenticateToken } from '../oauth/middleware';
import { createBotHandler, createBotValidators } from './bot';
import { createClientHandler, createClientValidators } from './client';
import { inviteHandler, inviteValidators } from './invite';
import { getProjectMemberships, verifyProjectAdmin } from './utils';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateToken);
projectAdminRouter.post('/:projectId/bot', createBotValidators, asyncWrap(createBotHandler));
projectAdminRouter.post('/:projectId/client', createClientValidators, asyncWrap(createClientHandler));
projectAdminRouter.post('/:projectId/invite', inviteValidators, asyncWrap(inviteHandler));

/**
 * Handles requests to "/admin/projects/{projectId}"
 * Returns project metadata and a list of members.
 */
projectAdminRouter.get(
  '/:projectId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const memberships = await getProjectMemberships(project.id as string);
    const members = [];
    for (const membership of memberships) {
      members.push({
        id: membership.id,
        user: membership.user,
        profile: membership.profile,
        accessPolicy: membership.accessPolicy,
        userConfiguration: membership.userConfiguration,
        role: getRole(project, membership),
      });
    }

    return res.status(200).json({
      project: {
        id: project?.id,
        name: project?.name,
        secret: project?.secret,
        site: project?.site,
      },
      members,
    });
  })
);

projectAdminRouter.post(
  '/:projectId/secrets',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const result = await systemRepo.updateResource({
      ...project,
      secret: req.body,
    });

    res.json(result);
  })
);

projectAdminRouter.post(
  '/:projectId/sites',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const result = await systemRepo.updateResource({
      ...project,
      site: req.body,
    });

    res.json(result);
  })
);

projectAdminRouter.get(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const { membershipId } = req.params;
    const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    res.json(membership);
  })
);

projectAdminRouter.post(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const resource = req.body;
    if (resource?.resourceType !== 'ProjectMembership' || resource.id !== req.params.membershipId) {
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
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      sendOutcome(res, forbidden);
      return;
    }

    const { membershipId } = req.params;
    const membership = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);

    if (project.owner?.reference === membership.user?.reference) {
      sendOutcome(res, badRequest('Cannot delete the owner of the project'));
      return;
    }

    await systemRepo.deleteResource('ProjectMembership', req.params.membershipId);
    sendOutcome(res, allOk);
  })
);

/**
 * Returns the role of the membership in the project.
 * There are 3 possible roles:
 *  1) "owner" - for the one owner of the project
 *  2) "admin" - for the admin of the project
 *  3) "member" - for any other member of the project
 * @param project The project resource.
 * @param membership The project membership resource.
 * @returns A string representing the role of the user in the project.
 */
function getRole(project: Project, membership: ProjectMembership): string {
  if (membership.user?.reference?.startsWith('Bot/')) {
    return 'bot';
  }
  if (membership.user?.reference?.startsWith('ClientApplication/')) {
    return 'client';
  }
  if (membership.profile?.reference?.startsWith('Patient/')) {
    return 'patient';
  }
  if (membership.user?.reference === project.owner?.reference) {
    return 'owner';
  }
  if (membership.admin) {
    return 'admin';
  }
  return 'member';
}

import { assertOk, badRequest, getStatus } from '@medplum/core';
import { Project, ProjectMembership } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { sendOutcome, systemRepo } from '../fhir';
import { authenticateToken } from '../oauth';
import { createClientHandler, createClientValidators } from './client';
import { inviteHandler, inviteValidators } from './invite';
import { getProjectMemberships, verifyProjectAdmin } from './utils';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateToken);
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
      return res.sendStatus(404);
    }

    // const { project, memberships } = projectDetails;
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
      },
      members,
    });
  })
);

projectAdminRouter.get(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      res.sendStatus(404);
      return;
    }

    const { membershipId } = req.params;
    const [outcome, membership] = await systemRepo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    assertOk(outcome, membership);
    res.status(getStatus(outcome)).json(membership);
  })
);

projectAdminRouter.post(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      res.sendStatus(404);
      return;
    }

    const resource = req.body;
    if (resource?.resourceType !== 'ProjectMembership' || resource.id !== req.params.membershipId) {
      res.sendStatus(400);
      return;
    }

    const [outcome, result] = await systemRepo.updateResource(resource);
    assertOk(outcome, result);
    res.status(getStatus(outcome)).json(result);
  })
);

projectAdminRouter.delete(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const project = await verifyProjectAdmin(req, res);
    if (!project) {
      res.sendStatus(404);
      return;
    }

    const { membershipId } = req.params;
    const [readOutcome, membership] = await systemRepo.readResource<ProjectMembership>(
      'ProjectMembership',
      membershipId
    );
    assertOk(readOutcome, membership);

    if (project.owner?.reference === membership.user?.reference) {
      sendOutcome(res, badRequest('Cannot delete the owner of the project'));
      return;
    }

    const [outcome] = await systemRepo.deleteResource('ProjectMembership', req.params.membershipId);
    assertOk(outcome, outcome);
    sendOutcome(res, outcome);
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
  if (membership.user?.reference?.startsWith('ClientApplication/')) {
    return 'client';
  }
  if (membership.user?.reference === project.owner?.reference) {
    return 'owner';
  }
  if (membership.admin) {
    return 'admin';
  }
  return 'member';
}

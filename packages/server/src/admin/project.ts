import { assertOk, getStatus } from '@medplum/core';
import { Project, ProjectMembership } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { asyncWrap } from '../async';
import { repo } from '../fhir';
import { authenticateToken } from '../oauth';
import { inviteHandler, inviteValidators } from './invite';
import { verifyProjectAdmin } from './utils';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateToken);
projectAdminRouter.post('/:projectId/invite', inviteValidators, asyncWrap(inviteHandler));

/**
 * Handles requests to "/admin/projects/{projectId}"
 * Returns project metadata and a list of members.
 */
projectAdminRouter.get(
  '/:projectId',
  asyncWrap(async (req: Request, res: Response) => {
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
        name: membership.profile?.display,
        accessPolicy: membership.accessPolicy,
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
    const projectDetails = await verifyProjectAdmin(req, res);
    if (!projectDetails) {
      res.sendStatus(404);
      return;
    }

    const { membershipId } = req.params;
    const [outcome, membership] = await repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
    assertOk(outcome);
    res.status(getStatus(outcome)).json(membership);
  })
);

projectAdminRouter.post(
  '/:projectId/members/:membershipId',
  asyncWrap(async (req: Request, res: Response) => {
    const projectDetails = await verifyProjectAdmin(req, res);
    if (!projectDetails) {
      res.sendStatus(404);
      return;
    }

    const resource = req.body;
    if (resource?.resourceType !== 'ProjectMembership' || resource.id !== req.params.membershipId) {
      res.sendStatus(400);
      return;
    }

    const [outcome, result] = await repo.updateResource(resource);
    assertOk(outcome);
    res.status(getStatus(outcome)).json(result);
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
  if (membership.user?.reference === project.owner?.reference) {
    return 'owner';
  }
  if (membership.admin) {
    return 'admin';
  }
  return 'member';
}

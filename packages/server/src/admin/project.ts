// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden, getReferenceString, Operator } from '@medplum/core';
import type { ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { setPassword } from '../auth/setpassword';
import { getAuthenticatedContext } from '../context';
import { sendEmail } from '../email/email';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { authenticateRequest } from '../oauth/middleware';
import { getUserByEmailInProject } from '../oauth/utils';
import { createBotHandler, createBotValidator } from './bot';
import { createClientHandler, createClientValidator } from './client';
import { inviteHandler, inviteValidator } from './invite';
import { verifyProjectAdmin } from './utils';

export const projectAdminRouter = Router();
projectAdminRouter.use(authenticateRequest);
projectAdminRouter.use(verifyProjectAdmin);

// POST to /admin/projects/setpassword
// to force set a User password associated to the project by the project admin.
projectAdminRouter.post(
  '/setpassword',
  [
    body('email').isEmail().withMessage('Valid email address is required'),
    body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const ctx = getAuthenticatedContext();
    const projectId = ctx.project.id;
    if (!projectId) {
      sendOutcome(res, badRequest('Project not found'));
      return;
    }

    const user = await getUserByEmailInProject(req.body.email, projectId);
    if (!user) {
      sendOutcome(res, badRequest('User not found'));
      return;
    }

    await setPassword(ctx.systemRepo, user, req.body.password as string);
    sendOutcome(res, allOk);
  }
);

projectAdminRouter.post('/:projectId/bot', createBotValidator, createBotHandler);
projectAdminRouter.post('/:projectId/client', createClientValidator, createClientHandler);
projectAdminRouter.post('/:projectId/invite', inviteValidator, inviteHandler);

/**
 * Handles requests to "/admin/projects/{projectId}"
 * Returns project metadata and a list of members.
 */
projectAdminRouter.get('/:projectId', async (req: Request, res: Response) => {
  const project = getAuthenticatedContext().project;
  return res.status(200).json({
    project: {
      id: project.id,
      name: project.name,
      secret: project.secret,
      site: project.site,
    },
  });
});

projectAdminRouter.post('/:projectId/secrets', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const result = await ctx.repo.updateResource({
    ...ctx.project,
    secret: req.body,
  });

  res.json(result);
});

projectAdminRouter.post('/:projectId/sites', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const result = await ctx.repo.updateResource({
    ...ctx.project,
    site: req.body,
  });
  res.json(result);
});

projectAdminRouter.get('/:projectId/members/:membershipId', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const membershipId = req.params.membershipId as string;
  const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  if (membership.project?.reference !== getReferenceString(ctx.project)) {
    sendOutcome(res, forbidden);
    return;
  }
  res.json(membership);
});

projectAdminRouter.post('/:projectId/members/:membershipId', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const membershipId = req.params.membershipId as string;
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
  const result = await ctx.repo.updateResource(resource);
  res.json(result);
});

projectAdminRouter.delete('/:projectId/members/:membershipId', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const membershipId = req.params.membershipId as string;
  const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);
  if (membership.project?.reference !== getReferenceString(ctx.project)) {
    sendOutcome(res, forbidden);
    return;
  }

  if (ctx.project.owner?.reference === membership.user?.reference) {
    sendOutcome(res, badRequest('Cannot delete the owner of the project'));
    return;
  }

  const systemRepo = ctx.systemRepo;
  const user = await systemRepo.readReference<User>(membership.user as Reference<User>);

  // Check if the user is project-scoped (has a project field matching the current project)
  if (user.project?.reference === getReferenceString(ctx.project)) {
    // Wrap search and delete operations in a transaction
    await systemRepo.withTransaction(async () => {
      // Check if there are other ProjectMemberships for this user
      // (search before deleting to get accurate count)
      const otherMemberships = await systemRepo.searchResources<ProjectMembership>({
        resourceType: 'ProjectMembership',
        filters: [
          {
            code: 'user',
            operator: Operator.EQUALS,
            value: getReferenceString(user),
          },
        ],
        count: 2,
      });

      // Delete the ProjectMembership
      await systemRepo.deleteResource('ProjectMembership', membershipId);

      // Delete the User resource if it's project-scoped and this was their only membership
      // (project-scoped users should only have memberships in one project)
      if (otherMemberships.length === 1 && otherMemberships[0].id === membershipId) {
        await systemRepo.deleteResource('User', user.id);
      }
    });
  } else {
    // User is not project-scoped, just delete the ProjectMembership
    await ctx.repo.deleteResource('ProjectMembership', membershipId);
  }

  sendOutcome(res, allOk);
});

/**
 * Handles requests to "/admin/projects/{projectId}/members/{membershipId}/mfa/reset"
 * Allows a project admin to reset MFA enrollment for a member who has lost access to their authenticator.
 * The user will need to re-enroll in MFA on their next login (if mfaRequired is set) or via the security page.
 */
projectAdminRouter.post('/:projectId/members/:membershipId/mfa/reset', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const membershipId = req.params.membershipId as string;
  const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);

  if (membership.project?.reference !== getReferenceString(ctx.project)) {
    sendOutcome(res, forbidden);
    return;
  }

  const systemRepo = ctx.systemRepo;
  const user = await systemRepo.readReference<User>(membership.user as Reference<User>);

  if (!user.mfaEnrolled && !user.mfaSecret) {
    sendOutcome(res, badRequest('User is not enrolled in MFA'));
    return;
  }

  await systemRepo.updateResource<User>({
    ...user,
    mfaEnrolled: false,
    // Rotate the secret so the old authenticator app entry cannot be re-used
    mfaSecret: authenticator.generateSecret(),
  });

  if (user.email) {
    await sendEmail(systemRepo, {
      to: user.email,
      subject: 'Your multi-factor authentication has been reset',
      text: [
        `Hello ${user.firstName ?? user.email},`,
        '',
        'A project administrator has reset your multi-factor authentication (MFA) enrollment.',
        'You will need to re-enroll the next time you sign in.',
        '',
        'If you did not expect this change, please contact your administrator immediately.',
      ].join('\n'),
    });
  }

  sendOutcome(res, allOk);
});

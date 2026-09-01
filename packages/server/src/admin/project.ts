// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, forbidden, getReferenceString, Operator } from '@medplum/core';
import type { ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { resetPassword } from '../auth/resetpassword';
import { setPassword } from '../auth/setpassword';
import type { MfaMethod } from '../auth/utils';
import { getEnrolledMfaMethods } from '../auth/utils';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { getAuthenticatedContext } from '../context';
import { sendEmail } from '../email/email';
import { reconcileDefaultAccessPolicy } from '../fhir/accesspolicy';
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
    body('password')
      .isLength({ min: MIN_PASSWORD_LENGTH })
      .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .isByteLength({ max: MAX_PASSWORD_LENGTH })
      .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
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
      setting: project.setting,
      secret: project.secret,
      site: project.site,
    },
  });
});

projectAdminRouter.post('/:projectId/settings', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const result = await ctx.repo.updateResource({
    ...ctx.project,
    setting: req.body,
  });

  res.json(result);
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
  // Keep the default access policy in sync when the admin flag is toggled, so an upgraded
  // admin isn't left restricted by the Practitioner default (and vice versa).
  const reconciled = reconcileDefaultAccessPolicy(ctx.project, resource as ProjectMembership);
  const result = await ctx.repo.updateResource(reconciled);
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
    await systemRepo.withTransaction(
      async (txRepo) => {
        // Check if there are other ProjectMemberships for this user
        // (search before deleting to get accurate count)
        const otherMemberships = await txRepo.searchResources<ProjectMembership>({
          resourceType: 'ProjectMembership',
          filters: [{ code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) }],
          count: 2,
        });

        // Delete the ProjectMembership
        await txRepo.deleteResource('ProjectMembership', membershipId);

        // Delete the User resource if it's project-scoped and this was their only membership
        // (project-scoped users should only have memberships in one project)
        if (otherMemberships.length === 1 && otherMemberships[0].id === membershipId) {
          await txRepo.deleteResource('User', user.id);
        }
      },
      { resourceTypes: ['ProjectMembership', 'User'], source: 'projectAdmin.deleteMember' }
    );
  } else {
    // User is not project-scoped, just delete the ProjectMembership
    await ctx.repo.deleteResource('ProjectMembership', membershipId);
  }

  sendOutcome(res, allOk);
});

/**
 * Handles requests to "/admin/projects/{projectId}/members/{membershipId}/mfa/reset"
 * Allows a project admin to reset MFA for a member who has lost access to a factor.
 *
 * The optional `method` field ('totp' | 'email') selects which factor to reset and
 * defaults to 'totp' for backwards compatibility: TOTP was historically the only MFA
 * method, so an empty body continues to reset TOTP, fully un-enrolling legacy users who
 * have no `mfaMethod` recorded. Any other enrolled factors are left in place.
 *
 * Unlike the self-service `/auth/mfa/disable` endpoint, this does not require the user to
 * prove control of a factor (the caller is a verified project admin) and does not enforce
 * the "cannot remove the last factor when MFA is required" guard — the whole point of an
 * admin reset is to recover a user who has lost their factor. Such a user will be forced
 * to re-enroll on next login when MFA is required.
 */
projectAdminRouter.post(
  '/:projectId/members/:membershipId/mfa/reset',
  [body('method').optional().isIn(['totp', 'email']).withMessage('Method must be "totp" or "email"')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const ctx = getAuthenticatedContext();
    const membershipId = req.params.membershipId as string;
    const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);

    if (membership.project?.reference !== getReferenceString(ctx.project)) {
      sendOutcome(res, forbidden);
      return;
    }

    const method: MfaMethod = (req.body.method as MfaMethod | undefined) ?? 'totp';

    const systemRepo = ctx.systemRepo;
    const user = await systemRepo.readReference<User>(membership.user as Reference<User>);

    const enrolled = getEnrolledMfaMethods(user);
    if (!enrolled.includes(method)) {
      sendOutcome(res, badRequest(`User is not enrolled in MFA method: ${method}`));
      return;
    }

    const remaining = enrolled.filter((m) => m !== method);
    await systemRepo.updateResource<User>({
      ...user,
      mfaEnrolled: remaining.length > 0,
      mfaMethod: remaining,
      // Rotate the authenticator secret when TOTP is reset so a lost/stolen device's
      // authenticator entry cannot be re-used. Email-only resets leave the secret intact.
      ...(method === 'totp' ? { mfaSecret: authenticator.generateSecret() } : {}),
    });

    if (user.email) {
      const methodLabel = method === 'totp' ? 'authenticator app (TOTP)' : 'email-based';
      await sendEmail(
        systemRepo,
        {
          to: user.email,
          subject: 'Your multi-factor authentication has been reset',
          text: [
            `Hello ${user.firstName ?? user.email},`,
            '',
            `A project administrator has reset your ${methodLabel} multi-factor authentication (MFA).`,
            remaining.length > 0
              ? 'Your other MFA methods remain active.'
              : 'You will need to re-enroll the next time you sign in.',
            '',
            'If you did not expect this change, please contact your administrator immediately.',
          ].join('\n'),
        },
        ctx.project
      );
    }

    sendOutcome(res, allOk);
  }
);

/**
 * Handles requests to "/admin/projects/{projectId}/members/{membershipId}/resetpassword"
 * Allows a project admin to send a password reset email to a member. This creates a
 * single-use UserSecurityRequest and emails the member a link to set a new password,
 * mirroring the self-service `/auth/resetpassword` flow but scoped to a known member.
 */
projectAdminRouter.post('/:projectId/members/:membershipId/resetpassword', async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const membershipId = req.params.membershipId as string;
  const membership = await ctx.repo.readResource<ProjectMembership>('ProjectMembership', membershipId);

  if (membership.project?.reference !== getReferenceString(ctx.project)) {
    sendOutcome(res, forbidden);
    return;
  }

  const systemRepo = ctx.systemRepo;
  const user = await systemRepo.readReference<User>(membership.user as Reference<User>);

  if (!user.email) {
    sendOutcome(res, badRequest('User does not have an email address'));
    return;
  }

  const url = await resetPassword(systemRepo, user, 'reset');
  await sendEmail(
    systemRepo,
    {
      to: user.email,
      subject: 'Medplum Password Reset',
      text: [
        `Hello ${user.firstName ?? user.email},`,
        '',
        'A project administrator has requested a password reset for your account.',
        '',
        'Please click on the following link to set a new password:',
        '',
        url,
        '',
        'If you did not expect this, please contact your administrator.',
        '',
        'Thank you,',
        'Medplum',
      ].join('\n'),
    },
    ctx.project
  );

  sendOutcome(res, allOk);
});

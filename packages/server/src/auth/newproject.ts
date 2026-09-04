// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operator, badRequest, getReferenceString } from '@medplum/core';
import type { Login, Project, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { getConfig } from '../config/loader';
import { createProject } from '../fhir/operations/projectinit';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { sendLoginResult } from './utils';
import { sendWelcomeEmail } from './welcomeemail';

export interface NewProjectRequest {
  readonly loginId: string;
  readonly projectName: string;
}

export const newProjectValidator = makeValidationMiddleware([
  body('login').isUUID().withMessage('Login ID is required.'),
  body('projectName').isLength({ min: 4, max: 72 }).withMessage('Project name must be between 4 and 72 characters'),
]);

/**
 * Handles a HTTP request to /auth/newproject.
 * Requires a partial login.
 * Creates a Project, Profile, ProjectMembership, and default ClientApplication.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function newProjectHandler(req: Request, res: Response): Promise<void> {
  const config = getConfig();
  if (config.registerEnabled === false) {
    // Explicitly check for "false" because the config value may be undefined
    sendOutcome(res, badRequest('Registration is disabled'));
    return;
  }

  const systemRepo = getGlobalSystemRepo();
  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const user = await systemRepo.readReference<User>(login.user as Reference<User>);

  if (config.requireVerifiedEmailForProjectCreation && !user.emailVerified) {
    sendOutcome(res, badRequest('Email verification is required to create a project'));
    return;
  }

  // Determine whether this is the user's first project (before creating the new
  // one) so we only welcome first-time project owners.
  const existingProject = await systemRepo.searchOne<Project>({
    resourceType: 'Project',
    filters: [{ code: 'owner', operator: Operator.EQUALS, value: getReferenceString(user) }],
  });
  const isFirstProject = !existingProject;

  const projectName = req.body.projectName;
  const { project, membership } = await createProject(projectName, user);
  const updatedLogin = await setLoginMembership(login, membership);

  // Send a welcome email, but only for the user's first project. This is
  // best-effort: any failure is logged inside sendWelcomeEmail and never blocks
  // registration.
  if (isFirstProject) {
    await sendWelcomeEmail(systemRepo, project, user);
  }

  await sendLoginResult(res, updatedLogin);
}

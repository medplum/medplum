// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, createReference } from '@medplum/core';
import type { Login, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { createProject } from '../fhir/operations/projectinit';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../sharding';
import { makeValidationMiddleware } from '../util/validator';

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
  const globalSystemRepo = getGlobalSystemRepo();
  const login = await globalSystemRepo.readResource<Login>('Login', req.body.login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const projectName = req.body.projectName;
  const user = await globalSystemRepo.readReference<User>(login.user as Reference<User>);
  const { membership } = await createProject(projectName, user);

  // Set the membership on the login
  const updatedLogin = await globalSystemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership as ProjectMembership),
  });

  res.status(200).json({
    login: updatedLogin.id,
    code: updatedLogin.code,
  });
}

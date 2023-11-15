import { badRequest, createReference } from '@medplum/core';
import { Login, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { createProject } from '../fhir/operations/projectinit';

export interface NewProjectRequest {
  readonly loginId: string;
  readonly projectName: string;
}

export const newProjectValidators = [
  body('login').notEmpty().withMessage('Missing login'),
  body('projectName').notEmpty().withMessage('Project name is required'),
];

/**
 * Handles a HTTP request to /auth/newproject.
 * Requires a partial login.
 * Creates a Project, Profile, ProjectMembership, and default ClientApplication.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function newProjectHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const projectName = req.body.projectName;
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  const { membership } = await createProject(projectName, user);

  // Set the membership on the login
  const updatedLogin = await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });

  res.status(200).json({
    login: updatedLogin.id,
    code: updatedLogin.code,
  });
}

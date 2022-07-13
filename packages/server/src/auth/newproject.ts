import { assertOk, badRequest, createReference } from '@medplum/core';
import { Login, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createClient } from '../admin/client';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { logger } from '../logger';
import { setLoginMembership } from '../oauth';
import { createProfile, createProjectMembership } from './utils';

export interface NewProjectRequest {
  readonly loginId: string;
  readonly projectName?: string;
}

export const newProjectValidators = [
  body('login').notEmpty().withMessage('Missing login'),
  body('projectName').notEmpty().withMessage('Project name is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
];

/**
 * Handles a HTTP request to /auth/newproject.
 * Requires a partial login.
 * Creates a Project, Profile, ProjectMembership, and default ClientApplication.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function newProjectHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const [loginOutcome, login] = await systemRepo.readResource<Login>('Login', req.body.login);
  assertOk(loginOutcome, login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const { projectName, firstName, lastName } = req.body;
  const membership = await createProject(login, projectName, firstName, lastName);

  // Update the login
  const [updateOutcome, updated] = await setLoginMembership(login, membership.id as string);
  assertOk(updateOutcome, updated);

  res.status(200).json({
    login: updated?.id,
    code: updated?.code,
  });
}

/**
 * Creates a new project.
 * @param login The partial login.
 * @param projectName The new project name.
 * @param firstName The practitioner's first name.
 * @param lastName The practitioner's last name.
 * @returns The new project membership.
 */
export async function createProject(
  login: Login,
  projectName: string,
  firstName: string,
  lastName: string
): Promise<ProjectMembership> {
  const [userOutcome, user] = await systemRepo.readReference<User>(login.user as Reference<User>);
  assertOk(userOutcome, user);

  logger.info('Create project ' + projectName);
  const [projectOutcome, project] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(user),
  });
  assertOk(projectOutcome, project);

  logger.info('Created project: ' + project.id);
  await createClient(systemRepo, {
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });

  const profile = await createProfile(project, 'Practitioner', firstName, lastName, user.email as string);
  const membership = await createProjectMembership(user, project, profile, undefined, true);

  // Set the membership on the login
  const [updateOutcome, updated] = await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  assertOk(updateOutcome, updated);

  return membership;
}

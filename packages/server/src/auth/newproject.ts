import { badRequest, createReference, ProfileResource } from '@medplum/core';
import { ClientApplication, Login, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createClient } from '../admin/client';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { setLoginMembership } from '../oauth/utils';
import { createProfile, createProjectMembership } from './utils';

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
 * @param req The HTTP request.
 * @param res The HTTP response.
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
  const { firstName, lastName } = user;
  const { membership } = await createProject(login, projectName, firstName as string, lastName as string);

  // Update the login
  const updated = await setLoginMembership(login, membership.id as string);

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
): Promise<{ project: Project; profile: ProfileResource; membership: ProjectMembership; client: ClientApplication }> {
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);

  logger.info('Create project ' + projectName);
  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: projectName,
    owner: createReference(user),
    strictMode: true,
  });

  logger.info('Created project: ' + project.id);
  const client = await createClient(systemRepo, {
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });

  const profile = await createProfile(project, 'Practitioner', firstName, lastName, user.email as string);
  const membership = await createProjectMembership(user, project, profile, { admin: true });

  // Set the membership on the login
  await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });

  return { project, profile, membership, client };
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { Login, Patient, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { getGlobalSystemRepo, getProjectAndProjectShardId } from '../sharding';
import { makeValidationMiddleware } from '../util/validator';
import { createProfile, createProjectMembership } from './utils';

export const newPatientValidator = makeValidationMiddleware([
  body('login').notEmpty().withMessage('Missing login'),
  body('projectId').notEmpty().withMessage('Project ID is required'),
]);

/**
 * Handles a HTTP request to /auth/newpatient.
 * Requires a partial login.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function newPatientHandler(req: Request, res: Response): Promise<void> {
  const globalSystemRepo = getGlobalSystemRepo();
  const login = await globalSystemRepo.readResource<Login>('Login', req.body.login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const { projectId } = req.body;

  const user = await globalSystemRepo.readReference<User>(login.user as Reference<User>);
  if (!user.project) {
    sendOutcome(res, badRequest('User must be scoped to the project'));
    return;
  }

  const { firstName, lastName } = user;
  const membership = await createPatient(login, projectId, firstName as string, lastName as string);

  // Update the login
  const updated = await setLoginMembership(login, membership.id);

  res.status(200).json({
    login: updated.id,
    code: updated.code,
  });
}

/**
 * Creates a new patient.
 * @param login - The partial login.
 * @param projectId - The project ID.
 * @param firstName - The patient's first name.
 * @param lastName - The patient's last name.
 * @returns The new project membership.
 */
async function createPatient(
  login: Login,
  projectId: string,
  firstName: string,
  lastName: string
): Promise<WithId<ProjectMembership>> {
  const globalSystemRepo = getGlobalSystemRepo();
  const user = await globalSystemRepo.readReference<User>(login.user as Reference<User>);
  const { project, projectShardId } = await getProjectAndProjectShardId({ reference: 'Project/' + projectId });

  if (!project.defaultPatientAccessPolicy) {
    throw new OperationOutcomeError(badRequest('Project does not allow open registration'));
  }

  const systemRepo = getSystemRepo(undefined, projectShardId);
  const profile = (await createProfile(
    systemRepo,
    project,
    'Patient',
    firstName,
    lastName,
    user.email as string
  )) as Patient;
  const policy = await systemRepo.readReference(project.defaultPatientAccessPolicy);
  const membership = await createProjectMembership(globalSystemRepo, user, project, profile, {
    accessPolicy: createReference(policy),
  });

  await globalSystemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  return membership;
}

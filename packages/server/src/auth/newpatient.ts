// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { Login, Patient, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { createProfile, createProjectMembership, getDefaultMembershipAccessFields, projectHasDefaultPatientAccess } from './utils';

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
  const systemRepo = getGlobalSystemRepo();
  const login = await systemRepo.readResource<Login>('Login', req.body.login);

  if (login.membership) {
    sendOutcome(res, badRequest('Login already has a membership'));
    return;
  }

  const { projectId } = req.body;

  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  if (!user.project) {
    sendOutcome(res, badRequest('User must be scoped to the project'));
    return;
  }

  const { firstName, lastName } = user;
  const membership = await createPatient(login, projectId, firstName, lastName);

  // Update the login
  const updated = await setLoginMembership(login, membership);

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
  const systemRepo = await getProjectSystemRepo(projectId);
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  const project = await systemRepo.readResource<Project>('Project', projectId);

  if (!projectHasDefaultPatientAccess(project)) {
    throw new OperationOutcomeError(badRequest('Project does not allow open registration'));
  }

  // S4: Verify that the default access policy references actually exist before creating the
  // membership. Without this, a dangling reference produces a broken membership: the patient
  // can complete registration but will receive a cryptic error at login time.
  const defaults = getDefaultMembershipAccessFields(project, 'Patient');
  if (defaults.accessPolicy) {
    try {
      await systemRepo.readReference(defaults.accessPolicy);
    } catch {
      throw new OperationOutcomeError(
        badRequest('Default access policy not found. Please contact your project administrator.')
      );
    }
  }
  for (const entry of defaults.access ?? []) {
    if (entry.policy) {
      try {
        await systemRepo.readReference(entry.policy);
      } catch {
        throw new OperationOutcomeError(
          badRequest('Default access policy not found. Please contact your project administrator.')
        );
      }
    }
  }

  const profile = (await createProfile(
    systemRepo,
    project,
    'Patient',
    firstName,
    lastName,
    user.email as string
  )) as Patient;
  const membership = await createProjectMembership(systemRepo, user, project, profile, {});

  await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  return membership;
}

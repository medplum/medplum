import { badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import { Login, Patient, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';
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
  const systemRepo = getSystemRepo();
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
  const membership = await createPatient(login, projectId, firstName as string, lastName as string);

  // Update the login
  const updated = await setLoginMembership(login, membership.id as string);

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
export async function createPatient(
  login: Login,
  projectId: string,
  firstName: string,
  lastName: string
): Promise<ProjectMembership> {
  const systemRepo = getSystemRepo();
  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  const project = await systemRepo.readResource<Project>('Project', projectId);

  if (!project.defaultPatientAccessPolicy) {
    throw new OperationOutcomeError(badRequest('Project does not allow open registration'));
  }

  const profile = (await createProfile(project, 'Patient', firstName, lastName, user.email as string)) as Patient;
  const policy = await systemRepo.readReference(project.defaultPatientAccessPolicy);
  const membership = await createProjectMembership(user, project, profile, {
    accessPolicy: createReference(policy),
  });

  await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  return membership;
}

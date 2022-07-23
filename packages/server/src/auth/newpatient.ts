import { assertOk, badRequest, createReference, formatHumanName, getReferenceString } from '@medplum/core';
import {
  AccessPolicy,
  HumanName,
  Login,
  Patient,
  Project,
  ProjectMembership,
  Reference,
  User,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { setLoginMembership } from '../oauth';
import { createProfile, createProjectMembership } from './utils';

export const newPatientValidators = [
  body('login').notEmpty().withMessage('Missing login'),
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
];

/**
 * Handles a HTTP request to /auth/newpatient.
 * Requires a partial login.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function newPatientHandler(req: Request, res: Response): Promise<void> {
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

  const { projectId, firstName, lastName } = req.body;
  const membership = await createPatient(login, projectId, firstName, lastName);

  // Update the login
  const [updateOutcome, updated] = await setLoginMembership(login, membership.id as string);
  assertOk(updateOutcome, updated);

  res.status(200).json({
    login: updated?.id,
    code: updated?.code,
  });
}

/**
 * Creates a new patient.
 * @param login The partial login.
 * @param projectId The project ID.
 * @param firstName The patient's first name.
 * @param lastName The patient's last name.
 * @returns The new project membership.
 */
export async function createPatient(
  login: Login,
  projectId: string,
  firstName: string,
  lastName: string
): Promise<ProjectMembership> {
  const [userOutcome, user] = await systemRepo.readReference<User>(login.user as Reference<User>);
  assertOk(userOutcome, user);

  const [projectOutcome, project] = await systemRepo.readResource<Project>('Project', projectId);
  assertOk(projectOutcome, project);

  if (!project.defaultPatientAccessPolicy) {
    throw badRequest('Project does not allow open registration');
  }

  const profile = (await createProfile(project, 'Patient', firstName, lastName, user.email as string)) as Patient;

  const [templateOutcome, template] = await systemRepo.readReference(project.defaultPatientAccessPolicy);
  assertOk(templateOutcome, template);

  const [policyOutcome, policy] = await systemRepo.createResource<AccessPolicy>(buildAccessPolicy(template, profile));
  assertOk(policyOutcome, policy);

  const membership = await createProjectMembership(user, project, profile, createReference(policy), true);

  const [updateOutcome, updated] = await systemRepo.updateResource<Login>({
    ...login,
    membership: createReference(membership),
  });
  assertOk(updateOutcome, updated);

  return membership;
}

function buildAccessPolicy(template: AccessPolicy, patient: Patient): AccessPolicy {
  const templateJson = JSON.stringify(template);
  const policyJson = templateJson
    .replaceAll('%patient.id', patient.id as string)
    .replaceAll('%patient', getReferenceString(patient));

  return {
    ...JSON.parse(policyJson),
    name: formatHumanName(patient.name?.[0] as HumanName) + ' Access Policy',
  };
}

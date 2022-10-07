import { badRequest, createReference, formatHumanName, getReferenceString, Operator } from '@medplum/core';
import { AccessPolicy, HumanName, Login, Practitioner, Project, Reference, User } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { createProfile, createProjectMembership } from '../auth/utils';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { setLoginMembership } from '../oauth/utils';

export const newPractitionerValidators = [
  body('login').notEmpty().withMessage('Missing login'),
  body('projectId').notEmpty().withMessage('Project ID is required'),
];

/**
 * Handles a HTTP request to /auth/newpractitioner.
 * Requires a partial login.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function newPractitionerHandler(req: Request, res: Response): Promise<void> {
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

  const { projectId } = req.body;
  const project = await systemRepo.readResource<Project>('Project', projectId);
  if (!project) {
    sendOutcome(res, badRequest('Project not found'));
    return;
  }

  if (!project.defaultPractitionerAccessPolicy) {
    sendOutcome(res, badRequest('Project does not allow open registration'));
    return;
  }

  const user = await systemRepo.readReference<User>(login.user as Reference<User>);
  if (!user.project) {
    sendOutcome(res, badRequest('User must be scoped to the project'));
    return;
  }

  const { firstName, lastName, email } = user;
  let profile = await searchForExistingPractitioner(projectId, email as string);
  if (!profile) {
    profile = (await createProfile(
      project,
      'Practitioner',
      firstName as string,
      lastName as string,
      email as string
    )) as Practitioner;
  }
  const template = await systemRepo.readReference(project.defaultPractitionerAccessPolicy);

  const policy = await systemRepo.createResource<AccessPolicy>(buildAccessPolicy(template, profile));

  const membership = await createProjectMembership(user, project, profile, createReference(policy));

  // Update the login
  const updated = await setLoginMembership(login, membership.id as string);

  res.status(200).json({
    login: updated?.id,
    code: updated?.code,
  });
}

function buildAccessPolicy(template: AccessPolicy, practitioner: Practitioner): AccessPolicy {
  const templateJson = JSON.stringify(template);
  const policyJson = templateJson
    .replaceAll('%practitioner.id', practitioner.id as string)
    .replaceAll('%practitioner', getReferenceString(practitioner));

  return {
    ...JSON.parse(policyJson),
    name: formatHumanName(practitioner.name?.[0] as HumanName) + ' Access Policy',
  };
}

async function searchForExistingPractitioner(project: Project, email: string): Promise<Practitioner | undefined> {
  const bundle = await systemRepo.search<Practitioner>({
    resourceType: 'Practitioner',
    filters: [
      {
        code: '_project',
        operator: Operator.EQUALS,
        value: project.id as string,
      },
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
      },
    ],
  });
  if (bundle.entry && bundle.entry.length > 0) {
    return bundle.entry[0].resource as Practitioner;
  }
  return undefined;
}

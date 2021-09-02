import { assertOk, Bundle, BundleEntry, createReference, Operator, Practitioner, Project, ProjectMembership, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { resetPassword } from '../auth/resetpassword';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { generateSecret } from '../oauth';

export const inviteValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required')
];

export async function inviteHandler(req: Request, res: Response) {
  const { projectId } = req.params;

  const [projectOutcome, project] = await repo.readResource<Project>('Project', projectId);
  assertOk(projectOutcome);

  const [membershipOutcome, bundle] = await repo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [{
      code: 'project',
      operator: Operator.EQUALS,
      value: 'Project/' + projectId
    }]
  });
  assertOk(membershipOutcome);

  const memberships = ((bundle as Bundle<ProjectMembership>).entry as BundleEntry<ProjectMembership>[])
    .map(entry => entry.resource as ProjectMembership);

  if (!memberships.find(m => m.user?.reference === 'User/' + res.locals.user && m.admin)) {
    return res.sendStatus(404);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const profile = await inviteUser({
    project: project as Project,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email
  });

  res.status(200).json({ profile });
}

export interface InviteRequest {
  project: Project;
  firstName: string;
  lastName: string;
  email: string;
}

export async function inviteUser(request: InviteRequest): Promise<Practitioner> {
  const project = request.project;
  let user = await searchForExisting(request.email);
  if (!user) {
    user = await createUser(request);
    await resetPassword(user);
  }
  const practitioner = await createPractitioner(request, project);
  await createProjectMembership(user, project, practitioner);
  return practitioner;
}

async function searchForExisting(email: string): Promise<User | undefined> {
  const [outcome, bundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });
  assertOk(outcome);
  if (bundle?.entry && bundle.entry.length > 0) {
    return bundle.entry[0].resource as User;
  }
  return undefined;
}

async function createUser(request: InviteRequest): Promise<User> {
  const email = request.email;
  const password = generateSecret(16);
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const [outcome, result] = await repo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as User).id);
  return result as User;
}

async function createPractitioner(request: InviteRequest, project: Project): Promise<Practitioner> {
  logger.info(`Create practitioner: ${request.firstName} ${request.lastName}`);
  const [outcome, result] = await repo.createResource<Practitioner>({
    resourceType: 'Practitioner',
    meta: {
      project: project.id
    },
    name: [{
      given: [request.firstName],
      family: request.lastName
    }],
    telecom: [
      {
        system: 'email',
        use: 'work',
        value: request.email
      }
    ]
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as Practitioner).id);
  return result as Practitioner;
}

async function createProjectMembership(user: User, project: Project, practitioner: Practitioner): Promise<ProjectMembership> {
  logger.info('Create project membership: ' + project.name);
  const [outcome, result] = await repo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    meta: {
      project: project.id
    },
    project: createReference(project),
    user: createReference(user),
    profile: createReference(practitioner),
    compartments: [
      createReference(project)
    ]
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as ProjectMembership).id);
  return result as ProjectMembership;
}

import { assertOk, badRequest, BundleEntry, createReference, Login, Operator, Practitioner, ProfileResource, Project, ProjectMembership, User } from '@medplum/core';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { MEDPLUM_CLIENT_APPLICATION_ID } from '../constants';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { getAuthTokens, tryLogin } from '../oauth';

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  projectName: string;
  email: string;
  password: string;
  scope?: string;
  role?: string;
  admin?: boolean;
}

export interface RegisterResponse {
  user: User;
  project: Project;
  profile: ProfileResource;
}

export const registerValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('projectName').notEmpty().withMessage('Project name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
];

export async function registerHandler(req: Request, res: Response) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendOutcome(res, invalidRequest(errors));
  }

  const { email, password } = req.body;

  if (await searchForExisting(email)) {
    return sendOutcome(res, badRequest('Email already registered', 'email'));
  }

  const result = await registerNew(req.body as RegisterRequest);
  const scope = req.body.scope ?? 'launch/patient openid fhirUser offline_access user/*.*';
  const role = req.body.role ?? 'practitioner';
  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    clientId: MEDPLUM_CLIENT_APPLICATION_ID,
    email: email,
    password: password,
    scope: scope,
    role: role,
    nonce: randomUUID(),
    remember: true
  });
  assertOk(loginOutcome);

  const [tokenOutcome, token] = await getAuthTokens(login as Login);
  assertOk(tokenOutcome);

  return res.status(200).json({
    ...token,
    ...result
  });
}

export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const user = await createUser(request);
  const project = await createProject(request, user);
  const practitioner = await createPractitioner(request, project);
  await createProjectMembership(user, project, practitioner);
  return {
    user,
    project,
    profile: practitioner
  }
}

async function searchForExisting(email: string): Promise<boolean> {
  const [outcome, bundle] = await repo.search<User>({
    resourceType: 'User',
    filters: [{
      code: 'email',
      operator: Operator.EQUALS,
      value: email
    }]
  });

  assertOk(outcome);
  return (bundle?.entry as BundleEntry<User>[]).length > 0;
}

async function createUser(request: RegisterRequest): Promise<User> {
  const { email, password, admin } = request;
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const [outcome, result] = await repo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
    admin
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as User).id);
  return result as User;
}

async function createProject(request: RegisterRequest, user: User): Promise<Project> {
  logger.info('Create project ' + request.projectName);
  const [outcome, result] = await repo.createResource<Project>({
    resourceType: 'Project',
    name: request.projectName,
    owner: createReference(user)
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as Project).id);
  return result as Project;
}

async function createPractitioner(request: RegisterRequest, project: Project): Promise<Practitioner> {
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

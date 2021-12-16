import { assertOk, badRequest, createReference, Operator, ProfileResource } from '@medplum/core';
import { BundleEntry, ClientApplication, Login, Project, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, repo, sendOutcome } from '../fhir';
import { logger } from '../logger';
import { generateSecret, getAuthTokens, tryLogin } from '../oauth';
import { createPractitioner, createProjectMembership } from './utils';

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
  client: ClientApplication;
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
  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    email: email,
    password: password,
    scope: scope,
    nonce: randomUUID(),
    remember: true
  });
  assertOk(loginOutcome);

  const [tokenOutcome, token] = await getAuthTokens(login as Login);
  assertOk(tokenOutcome);

  return res.status(200).json({
    ...token,
    project: result.project && createReference(result.project),
    profile: result.profile && createReference(result.profile)
  });
}

export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const user = await createUser(request);
  const project = await createProject(request, user);
  const profile = await createPractitioner(request, project);
  await createProjectMembership(user, project, profile, true);
  const client = await createClientApplication(project);
  return {
    user,
    project,
    profile,
    client
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

async function createClientApplication(project: Project): Promise<ClientApplication> {
  logger.info('Create default client ' + project.name);
  const [outcome, result] = await repo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
    secret: generateSecret(32),
    redirectUri: 'https://example.com/',
    meta: {
      project: project.id
    }
  });
  assertOk(outcome);
  logger.info('Created: ' + (result as ClientApplication).id);
  return result as ClientApplication;
}

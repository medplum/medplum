import { assertOk, badRequest, createReference, Operator, ProfileResource } from '@medplum/core';
import { BundleEntry, ClientApplication, Project, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { logger } from '../logger';
import { generateSecret, getAuthTokens, tryLogin } from '../oauth';
import { createPractitioner, createProjectMembership, verifyRecaptcha } from './utils';

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly projectName: string;
  readonly email: string;
  readonly password: string;
  readonly recaptchaToken?: string;
  readonly admin?: boolean;
}

export interface RegisterResponse {
  readonly user: User;
  readonly project: Project;
  readonly profile: ProfileResource;
  readonly client: ClientApplication;
}

export const registerValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('projectName').notEmpty().withMessage('Project name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 5 }).withMessage('Invalid password, must be at least 5 characters'),
  body('recaptchaToken').notEmpty().withMessage('Recaptcha token is required'),
];

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  if (!(await verifyRecaptcha(req.body.recaptchaToken))) {
    sendOutcome(res, badRequest('Recaptcha failed'));
    return;
  }

  const { email, password } = req.body;
  if (await searchForExisting(email)) {
    sendOutcome(res, badRequest('Email already registered', 'email'));
    return;
  }

  const result = await registerNew(req.body as RegisterRequest);
  const scope = req.body.scope ?? 'launch/patient openid fhirUser offline_access user/*.*';
  const [loginOutcome, login] = await tryLogin({
    authMethod: 'password',
    email: email,
    password: password,
    scope: scope,
    nonce: randomUUID(),
    remember: true,
  });
  assertOk(loginOutcome, login);

  const [tokenOutcome, token] = await getAuthTokens(login);
  assertOk(tokenOutcome, token);

  res.status(200).json({
    ...token,
    project: result.project && createReference(result.project),
    profile: result.profile && createReference(result.profile),
  });
}

export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const user = await createUser(request);
  const project = await createProject(request, user);
  const profile = await createPractitioner(request, project);
  await createProjectMembership(user, project, profile, undefined, true);
  const client = await createClientApplication(project);
  return {
    user,
    project,
    profile,
    client,
  };
}

async function searchForExisting(email: string): Promise<boolean> {
  const [outcome, bundle] = await systemRepo.search<User>({
    resourceType: 'User',
    filters: [
      {
        code: 'email',
        operator: Operator.EQUALS,
        value: email,
      },
    ],
  });

  assertOk(outcome, bundle);
  return (bundle.entry as BundleEntry<User>[]).length > 0;
}

async function createUser(request: RegisterRequest): Promise<User> {
  const { email, password, admin } = request;
  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const [outcome, result] = await systemRepo.createResource<User>({
    resourceType: 'User',
    email,
    passwordHash,
    admin,
  });
  assertOk(outcome, result);
  logger.info('Created: ' + result.id);
  return result;
}

async function createProject(request: RegisterRequest, user: User): Promise<Project> {
  logger.info('Create project ' + request.projectName);
  const [outcome, result] = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: request.projectName,
    owner: createReference(user),
  });
  assertOk(outcome, result);
  logger.info('Created: ' + result.id);
  return result;
}

async function createClientApplication(project: Project): Promise<ClientApplication> {
  logger.info('Create default client ' + project.name);
  const [outcome, result] = await systemRepo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
    secret: generateSecret(32),
    redirectUri: 'https://example.com/',
    meta: {
      project: project.id,
    },
  });
  assertOk(outcome, result);
  logger.info('Created: ' + result.id);
  return result;
}

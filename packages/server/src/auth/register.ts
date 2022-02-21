import { assertOk, badRequest, createReference, Operator, ProfileResource } from '@medplum/core';
import { BundleEntry, ClientApplication, OperationOutcome, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { createClient } from '../admin/client';
import { invalidRequest, sendOutcome, systemRepo } from '../fhir';
import { logger } from '../logger';
import { getAuthTokens, tryLogin } from '../oauth';
import { createPatient, createPractitioner, createProjectMembership, verifyRecaptcha } from './utils';

export interface RegisterRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly projectId?: string;
  readonly projectName?: string;
  readonly email: string;
  readonly password: string;
  readonly recaptchaToken?: string;
  readonly admin?: boolean;
}

export interface RegisterResponse {
  readonly user: User;
  readonly project: Project;
  readonly membership: ProjectMembership;
  readonly profile: ProfileResource;
  readonly client?: ClientApplication;
}

export const registerValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Invalid password, must be at least 8 characters'),
  body('recaptchaToken').notEmpty().withMessage('Recaptcha token is required'),
];

/**
 * Handles a HTTP request to /auth/register.
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
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

  try {
    const result = await registerNew(req.body as RegisterRequest);
    const { email, password } = req.body;
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

    const [tokenOutcome, token] = await getAuthTokens(login, createReference(result.profile));
    assertOk(tokenOutcome, token);

    res.status(200).json({
      ...token,
      project: result.project && createReference(result.project),
      membership: result.membership && createReference(result.membership),
      profile: result.profile && createReference(result.profile),
      client: result.client && createReference(result.client),
    });
  } catch (outcome) {
    sendOutcome(res, outcome as OperationOutcome);
  }
}

/**
 * Registers a new user and/or new project.
 *
 * There are four possible scenarios:
 * 1) New user, new project (new project, new admin practitioner)
 * 2) Existing user, new project (new project, new admin practitioner)
 * 3) New user, existing project (new patient)
 * 4) Existing user, existing project (new patient)
 *
 * @param request The register request.
 * @returns The registration response.
 */
export async function registerNew(request: RegisterRequest): Promise<RegisterResponse> {
  const { projectId, projectName } = request;
  if (!projectId && !projectName) {
    return Promise.reject(badRequest('Must provide either projectId or projectName'));
  }

  if (projectId && projectName) {
    return Promise.reject(badRequest('Cannot specify both projectId and projectName'));
  }

  if (projectName) {
    return registerNewProject(request);
  } else {
    return registerExistingProject(request);
  }
}

/**
 * Registers a new project.
 * This handles both new and existing users.
 * @param request The register request.
 * @returns The registration response.
 */
async function registerNewProject(request: RegisterRequest): Promise<RegisterResponse> {
  const user = await getOrCreateUser(request);
  const project = await createProject(request, user);
  const profile = await createPractitioner(request, project);
  const membership = await createProjectMembership(user, project, profile, undefined, true);
  const client = await createClient({
    project,
    name: project.name + ' Default Client',
    description: 'Default client for ' + project.name,
  });
  return {
    user,
    project,
    membership,
    profile,
    client,
  };
}

async function registerExistingProject(request: RegisterRequest): Promise<RegisterResponse> {
  const [projectOutcome, project] = await systemRepo.readResource<Project>('Project', request.projectId as string);
  assertOk(projectOutcome, project);

  if (!project.defaultPatientAccessPolicy) {
    return Promise.reject(badRequest('Project does not allow open registration'));
  }

  const user = await getOrCreateUser(request);
  const profile = await createPatient(request, project);
  const membership = await createProjectMembership(user, project, profile, project.defaultPatientAccessPolicy);
  return {
    user,
    project,
    membership,
    profile,
  };
}

async function getOrCreateUser(request: RegisterRequest): Promise<User> {
  const existingUser = await searchForExistingUser(request.email);
  if (existingUser) {
    return existingUser;
  }

  return createUser(request);
}

async function searchForExistingUser(email: string): Promise<User | undefined> {
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
  const entry = bundle.entry as BundleEntry<User>[];
  return entry.length > 0 ? entry[0].resource : undefined;
}

async function createUser(request: RegisterRequest): Promise<User> {
  const { email, password, admin } = request;

  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    return Promise.reject(badRequest('Password found in breach database', 'password'));
  }

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

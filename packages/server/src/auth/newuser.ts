import { badRequest, NewUserRequest, normalizeOperationOutcome } from '@medplum/core';
import { ClientApplication, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { getConfig } from '../config';
import { sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getUserByEmailInProject, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { bcryptHashPassword } from './utils';

export const newUserValidator = makeValidationMiddleware([
  body('firstName').isLength({ min: 1, max: 128 }).withMessage('First name must be between 1 and 128 characters'),
  body('lastName').isLength({ min: 1, max: 128 }).withMessage('Last name must be between 1 and 128 characters'),
  body('email')
    .isEmail()
    .withMessage('Valid email address between 3 and 72 characters is required')
    .isLength({ min: 3, max: 72 })
    .withMessage('Valid email address between 3 and 72 characters is required'),
  body('password').isByteLength({ min: 8, max: 72 }).withMessage('Password must be between 8 and 72 characters'),
]);

/**
 * Handles a HTTP request to /auth/newuser.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function newUserHandler(req: Request, res: Response): Promise<void> {
  const config = getConfig();
  if (config.registerEnabled === false) {
    // Explicitly check for "false" because the config value may be undefined
    sendOutcome(res, badRequest('Registration is disabled'));
    return;
  }

  const systemRepo = getSystemRepo();

  let projectId = req.body.projectId as string | undefined;

  // If the user specifies a client ID, then make sure it is compatible with the project
  const clientId = req.body.clientId;
  let client: ClientApplication | undefined = undefined;
  if (clientId) {
    client = await systemRepo.readResource<ClientApplication>('ClientApplication', clientId);
    if (projectId) {
      if (client.meta?.project !== projectId) {
        sendOutcome(res, badRequest('Client and project do not match'));
        return;
      }
    } else {
      projectId = client.meta?.project;
    }
  }

  // If the user is a practitioner, then projectId should be undefined
  // If the user is a patient, then projectId must be set
  const email = req.body.email.toLowerCase();
  let existingUser = undefined;
  if (req.body.projectId && req.body.projectId !== 'new') {
    existingUser = await getUserByEmailInProject(email, req.body.projectId);
  } else {
    existingUser = await getUserByEmailWithoutProject(email);
  }
  if (existingUser) {
    sendOutcome(res, badRequest('Email already registered', 'email'));
    return;
  }

  try {
    await createUser({ ...req.body, email } as NewUserRequest);

    const login = await tryLogin({
      authMethod: 'password',
      clientId,
      projectId,
      scope: req.body.scope || 'openid',
      nonce: req.body.nonce || randomUUID(),
      codeChallenge: req.body.codeChallenge,
      codeChallengeMethod: req.body.codeChallengeMethod,
      email,
      password: req.body.password,
      remember: req.body.remember,
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent'),
      allowNoMembership: true,
    });
    res.status(200).json({ login: login.id });
  } catch (err) {
    sendOutcome(res, normalizeOperationOutcome(err));
  }
}

export async function createUser(request: Omit<NewUserRequest, 'recaptchaToken'>): Promise<User> {
  const { firstName, lastName, email, password, projectId } = request;

  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    return Promise.reject(badRequest('Password found in breach database', 'password'));
  }

  globalLogger.info('User creation request received', { email });
  const passwordHash = await bcryptHashPassword(password);

  const systemRepo = getSystemRepo();
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
    project: projectId && projectId !== 'new' ? { reference: `Project/${projectId}` } : undefined,
  });
  globalLogger.info('User created', { id: result.id, email });
  return result;
}

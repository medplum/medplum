import { badRequest, NewUserRequest, normalizeOperationOutcome } from '@medplum/core';
import { ClientApplication, Project, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getUserByEmailInProject, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { bcryptHashPassword, getProjectByRecaptchaSiteKey, verifyRecaptcha } from './utils';

export const newUserValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

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

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    sendOutcome(res, invalidRequest(errors));
    return;
  }

  const recaptchaSiteKey = req.body.recaptchaSiteKey;
  let secretKey: string | undefined = getConfig().recaptchaSecretKey;
  let projectId = req.body.projectId as string | undefined;
  let project: Project | undefined;

  if (recaptchaSiteKey && recaptchaSiteKey !== getConfig().recaptchaSiteKey) {
    // If the recaptcha site key is not the main Medplum recaptcha site key,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    project = await getProjectByRecaptchaSiteKey(recaptchaSiteKey, projectId);
    if (!project) {
      sendOutcome(res, badRequest('Invalid recaptchaSiteKey'));
      return;
    }
    secretKey = project.site?.find((s) => s.recaptchaSiteKey === recaptchaSiteKey)?.recaptchaSecretKey;
    if (!secretKey) {
      sendOutcome(res, badRequest('Invalid recaptchaSecretKey'));
      return;
    }
    if (!project.defaultPatientAccessPolicy) {
      sendOutcome(res, badRequest('Project does not allow open registration'));
      return;
    }
    projectId = project.id;
  }

  if (secretKey) {
    if (!req.body.recaptchaToken) {
      sendOutcome(res, badRequest('Recaptcha token is required'));
      return;
    }

    if (!(await verifyRecaptcha(secretKey, req.body.recaptchaToken))) {
      sendOutcome(res, badRequest('Recaptcha failed'));
      return;
    }
  }

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

export async function createUser(request: NewUserRequest): Promise<User> {
  const { firstName, lastName, email, password, projectId } = request;

  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    return Promise.reject(badRequest('Password found in breach database', 'password'));
  }

  globalLogger.info('User creation request received', { email });
  const passwordHash = await bcryptHashPassword(password);
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
    project: projectId ? { reference: `Project/${projectId}` } : undefined,
  });
  globalLogger.info('User created', { id: result.id, email });
  return result;
}

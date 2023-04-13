import { badRequest, NewUserRequest, Operator } from '@medplum/core';
import { OperationOutcome, Project, User } from '@medplum/fhirtypes';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { getConfig } from '../config';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';
import { logger } from '../logger';
import { getUserByEmailInProject, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { verifyRecaptcha } from './utils';

export const newUserValidators = [
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

/**
 * Handles a HTTP request to /auth/newuser.
 * @param req The HTTP request.
 * @param res The HTTP response.
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
  let project: Project | undefined;

  if (recaptchaSiteKey && recaptchaSiteKey !== getConfig().recaptchaSiteKey) {
    // If the recaptcha site key is not the main Medplum recaptcha site key,
    // then it must be associated with a Project.
    // The user can only authenticate with that project.
    project = await getProjectByRecaptchaSiteKey(recaptchaSiteKey, req.body.projectId as string | undefined);
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

  // If the user is a practitioner, then projectId should be undefined
  // If the user is a patient, then projectId must be set
  let existingUser = undefined;
  if (req.body.projectId && req.body.projectId !== 'new') {
    existingUser = await getUserByEmailInProject(req.body.email, req.body.projectId);
  } else {
    existingUser = await getUserByEmailWithoutProject(req.body.email);
  }
  if (existingUser) {
    sendOutcome(res, badRequest('Email already registered', 'email'));
    return;
  }

  try {
    await createUser(req.body as NewUserRequest);

    const login = await tryLogin({
      authMethod: 'password',
      projectId: req.body.projectId || undefined,
      scope: req.body.scope || 'openid',
      nonce: req.body.nonce || randomUUID(),
      codeChallenge: req.body.codeChallenge,
      codeChallengeMethod: req.body.codeChallengeMethod,
      email: req.body.email,
      password: req.body.password,
      remember: req.body.remember,
      remoteAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    res.status(200).json({ login: login?.id });
  } catch (outcome) {
    sendOutcome(res, outcome as OperationOutcome);
  }
}

export async function createUser(request: NewUserRequest): Promise<User> {
  const { firstName, lastName, email, password, projectId } = request;

  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    return Promise.reject(badRequest('Password found in breach database', 'password'));
  }

  logger.info('Create user ' + email);
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    firstName,
    lastName,
    email,
    passwordHash,
    project: projectId ? { reference: `Project/${projectId}` } : undefined,
  });
  logger.info('Created: ' + result.id);
  return result;
}

async function getProjectByRecaptchaSiteKey(
  recaptchaSiteKey: string,
  projectId: string | undefined
): Promise<Project | undefined> {
  const filters = [
    {
      code: 'recaptcha-site-key',
      operator: Operator.EQUALS,
      value: recaptchaSiteKey,
    },
  ];

  if (projectId) {
    filters.push({
      code: '_id',
      operator: Operator.EQUALS,
      value: projectId,
    });
  }

  const bundle = await systemRepo.search<Project>({
    resourceType: 'Project',
    count: 1,
    filters,
  });
  return bundle.entry && bundle.entry.length > 0 ? bundle.entry[0].resource : undefined;
}

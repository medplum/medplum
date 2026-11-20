// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, concatUrls, normalizeOperationOutcome, OperationOutcomeError } from '@medplum/core';
import type { ClientApplication, Login, Project, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../constants';
import { sendEmail } from '../email/email';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getUserByEmailInProject, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { bcryptHashPassword, isEmailDomainBlocked, projectRegistrationAllowed } from './utils';
import { verifyEmail } from './verifyemail';

export const newUserValidator = makeValidationMiddleware([
  body('firstName').isLength({ min: 1, max: 128 }).withMessage('First name must be between 1 and 128 characters'),
  body('lastName').isLength({ min: 1, max: 128 }).withMessage('Last name must be between 1 and 128 characters'),
  body('email')
    .isEmail()
    .withMessage('Valid email address between 3 and 72 characters is required')
    .isLength({ min: 3, max: 72 })
    .withMessage('Valid email address between 3 and 72 characters is required'),
  body('password')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .isByteLength({ max: MAX_PASSWORD_LENGTH })
    .withMessage(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters`),
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

  let projectId = req.body.projectId as string | undefined;

  // If the user specifies a client ID, then make sure it is compatible with the project
  const clientId = req.body.clientId;
  let client: ClientApplication | undefined = undefined;
  if (clientId) {
    client = await getGlobalSystemRepo().readResource<ClientApplication>('ClientApplication', clientId);
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

  if (projectId && projectId !== 'new') {
    let project: Project;
    try {
      project = await getGlobalSystemRepo().readResource<Project>('Project', projectId);
    } catch (err) {
      sendOutcome(res, normalizeOperationOutcome(err));
      return;
    }
    const registrationOutcome = projectRegistrationAllowed(project);
    if (registrationOutcome) {
      sendOutcome(res, registrationOutcome);
      return;
    }
  }

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
    const user = await createUser({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email,
      password: req.body.password,
      projectId: req.body.projectId,
    });

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

    let emailVerificationRequired = false;
    if (config.requireVerifiedEmailForProjectCreation && projectId === 'new') {
      await sendVerificationEmail(user, login);
      emailVerificationRequired = true;
    }
    res.status(200).json({ login: login.id, emailVerificationRequired });
  } catch (err) {
    sendOutcome(res, normalizeOperationOutcome(err));
  }
}

export interface CreateUserRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** Omit for users who sign in only with an external identity provider. */
  readonly password?: string;
  /** Creates a project-scoped User; omit or use 'new' for a server-scoped User. */
  readonly projectId?: string;
}

/** Trusted settings that must never be populated from client input. */
export interface CreateUserOptions {
  /** Set only when the email address has been verified, e.g. by a trusted identity provider. */
  readonly emailVerified?: boolean;
  /** Skips the server-wide `blockedEmailDomains` check; for super admin operations only. */
  readonly skipEmailDomainCheck?: boolean;
}

/**
 * Creates a new User.
 *
 * Server-scoped Users are rejected if their email domain is in the server-wide
 * `blockedEmailDomains` config setting, unless `options.skipEmailDomainCheck` is set.
 * @param request - The new user details.
 * @param options - Trusted settings that must never come from client input.
 * @returns The new User.
 */
export async function createUser(request: CreateUserRequest, options: CreateUserOptions = {}): Promise<WithId<User>> {
  const { firstName, lastName, email, password } = request;
  // 'new' means the User will create a new project, so it is server-scoped
  const userProjectId = request.projectId === 'new' ? undefined : request.projectId;

  if (!userProjectId && !options.skipEmailDomainCheck && isEmailDomainBlocked(email, getConfig().blockedEmailDomains)) {
    throw new OperationOutcomeError(badRequest('Email domain is not allowed', 'email'));
  }

  let passwordHash: string | undefined;
  if (password) {
    const numPwns = await pwnedPassword(password);
    if (numPwns > 0) {
      throw badRequest('Password found in breach database', 'password');
    }
    passwordHash = await bcryptHashPassword(password);
  }

  globalLogger.info('User creation request received', { email });
  const systemRepo = getGlobalSystemRepo();
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    meta: userProjectId ? { project: userProjectId } : undefined,
    firstName,
    lastName,
    email,
    emailVerified: options.emailVerified,
    passwordHash,
    project: userProjectId ? { reference: `Project/${userProjectId}` } : undefined,
  });

  globalLogger.info('User created', { id: result.id, email });
  return result;
}

export async function sendVerificationEmail(user: WithId<User>, login: WithId<Login>): Promise<void> {
  const redirectUri = concatUrls(getConfig().appBaseUrl, `register?login=${login.id}`);
  const systemRepo = getGlobalSystemRepo();
  const { id, secret } = await verifyEmail(systemRepo, user, redirectUri);
  const url = concatUrls(getConfig().appBaseUrl, `verifyemail/${id}/${secret}`);
  const project = user.project ? await systemRepo.readReference<Project>(user.project) : undefined;
  await sendEmail(
    systemRepo,
    {
      to: user.email,
      subject: 'Medplum Email Verification',
      text: [
        'We received a request to create a Medplum account using this email address.',
        '',
        'Please click the following link to verify your email address:',
        '',
        url,
        '',
        'If you received this in error, you can safely ignore it.',
        '',
        'Thank you,',
        'Medplum',
        '',
      ].join('\n'),
    },
    project
  );
}

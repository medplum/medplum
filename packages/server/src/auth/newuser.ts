// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { NewUserRequest, WithId } from '@medplum/core';
import { badRequest, concatUrls, normalizeOperationOutcome } from '@medplum/core';
import type { ClientApplication, Login, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import { pwnedPassword } from 'hibp';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config/loader';
import { sendEmail } from '../email/email';
import { sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getUserByEmailInProject, getUserByEmailWithoutProject, tryLogin } from '../oauth/utils';
import { makeValidationMiddleware } from '../util/validator';
import { bcryptHashPassword } from './utils';
import { verifyEmail } from './verifyemail';

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
    const user = await createUser({ ...req.body, email } as NewUserRequest);

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

export async function createUser(request: NewUserRequest): Promise<WithId<User>> {
  const { firstName, lastName, email, password, projectId } = request;

  const numPwns = await pwnedPassword(password);
  if (numPwns > 0) {
    throw badRequest('Password found in breach database', 'password');
  }

  globalLogger.info('User creation request received', { email });
  const passwordHash = await bcryptHashPassword(password);

  const systemRepo = getGlobalSystemRepo();
  const result = await systemRepo.createResource<User>({
    resourceType: 'User',
    meta: projectId && projectId !== 'new' ? { project: projectId } : undefined,
    firstName,
    lastName,
    email,
    passwordHash,
    project: projectId && projectId !== 'new' ? { reference: `Project/${projectId}` } : undefined,
  });

  globalLogger.info('User created', { id: result.id, email });
  return result;
}

async function sendVerificationEmail(user: WithId<User>, login: WithId<Login>): Promise<void> {
  const redirectUri = concatUrls(getConfig().appBaseUrl, `register?login=${login.id}`);
  const systemRepo = getGlobalSystemRepo();
  const { id, secret } = await verifyEmail(systemRepo, user, redirectUri);
  const url = concatUrls(getConfig().appBaseUrl, `verifyemail/${id}/${secret}`);
  await sendEmail(systemRepo, {
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
  });
}

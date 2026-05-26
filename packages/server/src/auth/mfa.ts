// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { Login, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo } from '../fhir/repo';
import { authenticateRequest } from '../oauth/middleware';
import { verifyMfaToken } from '../oauth/utils';
import type { MfaMethod } from './utils';
import { getAllowedMfaMethods, getEnrolledMfaMethods, sendLoginResult, sendMfaEmailCode } from './utils';

export const mfaRouter = Router();

/**
 * Parses and validates the requested MFA method from a request body.
 * Defaults to 'totp' to preserve the historical authenticator-only behavior.
 * @param value - The raw `method` value from the request body.
 * @returns The MFA method.
 */
function parseMfaMethod(value: unknown): MfaMethod {
  return value === 'email' ? 'email' : 'totp';
}

/**
 * Returns the union of the user's existing MFA methods plus the new method.
 * @param user - The user.
 * @param method - The method to add.
 * @returns The updated list of MFA methods.
 */
function addMfaMethod(user: User, method: MfaMethod): MfaMethod[] {
  const methods = new Set<MfaMethod>(getEnrolledMfaMethods(user));
  methods.add(method);
  return Array.from(methods);
}

mfaRouter.get('/status', authenticateRequest, async (_req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  let user = await ctx.systemRepo.readReference<User>(ctx.membership.user as Reference<User>);
  const allowedMethods = getAllowedMfaMethods(ctx.project);

  if (user.mfaEnrolled) {
    res.json({ enrolled: true, enrolledMethods: getEnrolledMfaMethods(user), allowedMethods });
    return;
  }

  if (!user.mfaSecret) {
    user = await ctx.systemRepo.updateResource({
      ...user,
      mfaSecret: authenticator.generateSecret(),
    });
  }

  const accountName = `Medplum - ${user.email}`;
  const issuer = 'medplum.com';
  const secret = user.mfaSecret as string;
  const otp = authenticator.keyuri(accountName, issuer, secret);

  res.json({
    enrolled: false,
    enrolledMethods: [],
    allowedMethods,
    enrollUri: otp,
    enrollQrCode: await toDataURL(otp),
  });
});

mfaRouter.post(
  '/login-enroll',
  [body('login').notEmpty().withMessage('Missing login')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const systemRepo = getGlobalSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', req.body.login);
    const user = await systemRepo.readReference<User>(login.user as Reference<User>);

    if (user.mfaEnrolled) {
      sendOutcome(res, badRequest('Already enrolled'));
      return;
    }

    const method = parseMfaMethod(req.body.method);

    if (method === 'email') {
      // Enroll in email-based MFA. No token to verify here; the user proves
      // control of their email by clicking the magic link sent during the
      // subsequent MFA challenge (see sendLoginResult).
      await systemRepo.updateResource({
        ...user,
        mfaEnrolled: true,
        mfaMethod: addMfaMethod(user, 'email'),
      });
      await sendLoginResult(res, login);
      return;
    }

    if (!user.mfaSecret) {
      sendOutcome(res, badRequest('Secret not found'));
      return;
    }

    if (!req.body.token) {
      sendOutcome(res, badRequest('Missing token'));
      return;
    }

    const result = await verifyMfaToken(login, req.body.token);

    await systemRepo.updateResource({
      ...user,
      mfaEnrolled: true,
      mfaMethod: addMfaMethod(user, 'totp'),
    });

    await sendLoginResult(res, result);
  }
);

mfaRouter.post('/enroll', authenticateRequest, async (req: Request, res: Response) => {
  const systemRepo = getGlobalSystemRepo();
  const ctx = getAuthenticatedContext();
  const user = await systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

  const method = parseMfaMethod(req.body.method);

  // Guard per-method so a user can later add a second method (e.g. enroll in
  // email after already having TOTP), while still rejecting duplicate enrollment.
  if (getEnrolledMfaMethods(user).includes(method)) {
    sendOutcome(res, badRequest('Already enrolled'));
    return;
  }

  if (!getAllowedMfaMethods(ctx.project).includes(method)) {
    sendOutcome(res, badRequest('MFA method not allowed'));
    return;
  }

  if (method === 'email') {
    await systemRepo.updateResource({
      ...user,
      mfaEnrolled: true,
      mfaMethod: addMfaMethod(user, 'email'),
    });
    sendOutcome(res, allOk);
    return;
  }

  if (!user.mfaSecret) {
    sendOutcome(res, badRequest('Secret not found'));
    return;
  }

  if (!req.body.token) {
    sendOutcome(res, badRequest('Missing token'));
    return;
  }

  const secret = user.mfaSecret;
  const token = req.body.token as string;
  authenticator.options = { window: getConfig().mfaAuthenticatorWindow ?? 1 };
  if (!authenticator.verify({ token, secret })) {
    sendOutcome(res, badRequest('Invalid token'));
    return;
  }

  await systemRepo.updateResource({
    ...user,
    mfaEnrolled: true,
    mfaMethod: addMfaMethod(user, 'totp'),
  });
  sendOutcome(res, allOk);
});

mfaRouter.post(
  '/verify',
  [body('login').notEmpty().withMessage('Missing login'), body('token').notEmpty().withMessage('Missing token')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const systemRepo = getGlobalSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', req.body.login);
    const result = await verifyMfaToken(login, req.body.token);
    await sendLoginResult(res, result);
  }
);

mfaRouter.post(
  '/send-email',
  [body('login').notEmpty().withMessage('Missing login')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const systemRepo = getGlobalSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', req.body.login);

    if (login.revoked) {
      sendOutcome(res, badRequest('Login revoked'));
      return;
    }
    if (login.granted) {
      sendOutcome(res, badRequest('Login granted'));
      return;
    }
    if (login.mfaVerified) {
      sendOutcome(res, badRequest('Login already verified'));
      return;
    }

    const user = await systemRepo.readReference<User>(login.user as Reference<User>);
    if (!user.mfaEnrolled || !getEnrolledMfaMethods(user).includes('email')) {
      sendOutcome(res, badRequest('User not enrolled in email MFA'));
      return;
    }

    await sendMfaEmailCode(login, user);
    sendOutcome(res, allOk);
  }
);

mfaRouter.post(
  '/disable',
  authenticateRequest,
  [body('token').optional().isString()],
  async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const user = await ctx.systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

    if (!user.mfaEnrolled) {
      sendOutcome(res, badRequest('User not enrolled in MFA'));
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    // If the user is enrolled in TOTP, require a valid authenticator code to
    // disable. Email-only users are already authenticated for this request, so
    // no second factor is available to verify.
    if (getEnrolledMfaMethods(user).includes('totp')) {
      if (!user.mfaSecret) {
        sendOutcome(res, badRequest('Secret not found'));
        return;
      }
      if (!req.body.token) {
        sendOutcome(res, badRequest('Missing token'));
        return;
      }
      const secret = user.mfaSecret;
      const token = req.body.token as string;
      authenticator.options = { window: getConfig().mfaAuthenticatorWindow ?? 1 };
      if (!authenticator.verify({ token, secret })) {
        sendOutcome(res, badRequest('Invalid token'));
        return;
      }
    }

    await ctx.systemRepo.updateResource({
      ...user,
      mfaEnrolled: false,
      mfaMethod: [],
      // We generate a new secret so that next time the user enrolls that they don't get the same secret
      // This allows for new secrets in the case of lost / stolen two-factor devices
      mfaSecret: authenticator.generateSecret(),
    });
    sendOutcome(res, allOk);
  }
);

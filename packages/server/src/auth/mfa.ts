// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest } from '@medplum/core';
import type { Login, Reference, User } from '@medplum/fhirtypes';
import bcrypt from 'bcrypt';
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

/**
 * Verifies that the supplied token proves control of one of the user's
 * currently-enrolled MFA factors. The token may be either an authenticator
 * (TOTP) code or the 6-digit code emailed via `/send-email-challenge`, so the
 * user only needs to satisfy a single connected factor to make a change.
 * @param user - The user.
 * @param login - The current login (holds the emailed code hash, if any).
 * @param token - The user supplied token.
 * @returns True if the token matches an enrolled factor.
 */
async function verifyConnectedFactor(user: User, login: Login, token: string | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  const methods = getEnrolledMfaMethods(user);

  // Authenticator app
  if (methods.includes('totp') && user.mfaSecret) {
    authenticator.options = { window: getConfig().mfaAuthenticatorWindow ?? 1 };
    if (authenticator.verify({ token, secret: user.mfaSecret })) {
      return true;
    }
  }

  // Emailed code
  if (methods.includes('email') && login.emailMfa) {
    if (
      new Date(login.emailMfa.expiresAt).getTime() >= Date.now() &&
      (await bcrypt.compare(token, login.emailMfa.codeHash))
    ) {
      return true;
    }
  }

  return false;
}

mfaRouter.get('/status', authenticateRequest, async (_req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  let user = await ctx.systemRepo.readReference<User>(ctx.membership.user as Reference<User>);
  const allowedMethods = getAllowedMfaMethods(ctx.project);

  // Ensure the user has an authenticator secret so the TOTP QR code can always
  // be shown, whether for initial enrollment or for adding TOTP as a second
  // method to an account already enrolled in email-based MFA.
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
    enrolled: Boolean(user.mfaEnrolled),
    enrolledMethods: getEnrolledMfaMethods(user),
    allowedMethods,
    email: user.email,
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

/**
 * Emails a verification code to the currently authenticated user so they can
 * prove control of their email factor when changing MFA settings (removing a
 * factor or disabling MFA). The code is stored on the current login and later
 * checked by the `/disable` endpoint.
 */
mfaRouter.post('/send-email-challenge', authenticateRequest, async (_req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const user = await ctx.systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

  if (!user.mfaEnrolled || !getEnrolledMfaMethods(user).includes('email')) {
    sendOutcome(res, badRequest('User not enrolled in email MFA'));
    return;
  }

  await sendMfaEmailCode(ctx.login as WithId<Login>, user);
  sendOutcome(res, allOk);
});

mfaRouter.post(
  '/disable',
  authenticateRequest,
  [body('token').optional().isString(), body('method').optional().isString()],
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

    const enrolledMethods = getEnrolledMfaMethods(user);

    // When a `method` is provided, remove just that single factor and leave any
    // other enrolled factors in place. When it is omitted, disable MFA entirely
    // (the historical behavior).
    let methodToRemove: MfaMethod | undefined;
    if (req.body.method !== undefined) {
      const requested = req.body.method as unknown;
      if (requested !== 'totp' && requested !== 'email') {
        sendOutcome(res, badRequest('Invalid method'));
        return;
      }
      methodToRemove = requested;
      if (!enrolledMethods.includes(methodToRemove)) {
        sendOutcome(res, badRequest('User not enrolled in MFA method'));
        return;
      }
    }

    // Require the user to prove control of one of their connected factors. The
    // token may be an authenticator code or the code emailed via
    // `/send-email-challenge` — whichever method they are enrolled in.
    if (!req.body.token) {
      sendOutcome(res, badRequest('Missing token'));
      return;
    }
    if (!(await verifyConnectedFactor(user, ctx.login, req.body.token as string))) {
      sendOutcome(res, badRequest('Invalid token'));
      return;
    }

    const remainingMethods = methodToRemove ? enrolledMethods.filter((m) => m !== methodToRemove) : [];

    // Regenerate the authenticator secret whenever TOTP is being removed, so a
    // future re-enrollment gets a fresh secret. This covers the lost / stolen
    // device case. Email-only removals leave the secret untouched.
    const totpRemoved = !methodToRemove || methodToRemove === 'totp';

    await ctx.systemRepo.updateResource({
      ...user,
      mfaEnrolled: remainingMethods.length > 0,
      mfaMethod: remainingMethods,
      ...(totpRemoved ? { mfaSecret: authenticator.generateSecret() } : {}),
    });

    // Consume any emailed verification code so it cannot be reused.
    if (ctx.login.emailMfa) {
      await ctx.systemRepo.updateResource<Login>({ ...ctx.login, emailMfa: undefined });
    }

    sendOutcome(res, allOk);
  }
);

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { Login, Reference, User } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { getAuthenticatedContext } from '../context';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { getGlobalSystemRepo, getSystemRepo } from '../fhir/repo';
import { authenticateRequest } from '../oauth/middleware';
import { verifyMfaToken } from '../oauth/utils';
import { sendLoginResult } from './utils';

authenticator.options = {
  window: 1,
};

export const mfaRouter = Router();

mfaRouter.get('/status', authenticateRequest, async (_req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();
  const systemRepo = getSystemRepo(undefined, ctx.authState.projectShardId);
  let user = await systemRepo.readReference<User>(ctx.membership.user as Reference<User>);
  if (user.mfaEnrolled) {
    res.json({ enrolled: true });
    return;
  }

  if (!user.mfaSecret) {
    user = await systemRepo.updateResource({
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
    enrollUri: otp,
    enrollQrCode: await toDataURL(otp),
  });
});

mfaRouter.post(
  '/login-enroll',
  [body('login').notEmpty().withMessage('Missing login'), body('token').notEmpty().withMessage('Missing token')],
  async (req: Request, res: Response) => {
    const globalSystemRepo = getGlobalSystemRepo();
    const login = await globalSystemRepo.readResource<Login>('Login', req.body.login);
    const user = await globalSystemRepo.readReference<User>(login.user as Reference<User>);

    if (user.mfaEnrolled) {
      sendOutcome(res, badRequest('Already enrolled'));
      return;
    }

    if (!user.mfaSecret) {
      sendOutcome(res, badRequest('Secret not found'));
      return;
    }

    const result = await verifyMfaToken(login, req.body.token);

    await globalSystemRepo.updateResource({
      ...user,
      mfaEnrolled: true,
    });

    await sendLoginResult(res, result);
  }
);

mfaRouter.post(
  '/enroll',
  authenticateRequest,
  [body('token').notEmpty().withMessage('Missing token')],
  async (req: Request, res: Response) => {
    const globalSystemRepo = getGlobalSystemRepo();
    const ctx = getAuthenticatedContext();
    const user = await globalSystemRepo.readReference<User>(ctx.membership.user as Reference<User>);

    if (user.mfaEnrolled) {
      sendOutcome(res, badRequest('Already enrolled'));
      return;
    }

    if (!user.mfaSecret) {
      sendOutcome(res, badRequest('Secret not found'));
      return;
    }

    const secret = user.mfaSecret as string;
    const token = req.body.token as string;
    if (!authenticator.check(token, secret)) {
      sendOutcome(res, badRequest('Invalid token'));
      return;
    }

    await globalSystemRepo.updateResource({
      ...user,
      mfaEnrolled: true,
    });
    sendOutcome(res, allOk);
  }
);

mfaRouter.post(
  '/verify',
  [body('login').notEmpty().withMessage('Missing login'), body('token').notEmpty().withMessage('Missing token')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return Promise.resolve();
    }

    const globalSystemRepo = getGlobalSystemRepo();
    const login = await globalSystemRepo.readResource<Login>('Login', req.body.login);
    const result = await verifyMfaToken(login, req.body.token);
    return sendLoginResult(res, result);
  }
);

mfaRouter.post(
  '/disable',
  [body('token').notEmpty().withMessage('Missing token')],
  async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();
    const systemRepo = getSystemRepo(undefined, ctx.authState.projectShardId);
    const user = await systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

    if (!user.mfaSecret) {
      sendOutcome(res, badRequest('Secret not found'));
      return;
    }

    if (!user.mfaEnrolled) {
      sendOutcome(res, badRequest('User not enrolled in MFA'));
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const secret = user.mfaSecret as string;
    const token = req.body.token as string;
    if (!authenticator.check(token, secret)) {
      sendOutcome(res, badRequest('Invalid token'));
      return;
    }

    await systemRepo.updateResource({
      ...user,
      mfaEnrolled: false,
      // We generate a new secret so that next time the user enrolls that they don't get the same secret
      // This allows for new secrets in the case of lost / stolen two-factor devices
      mfaSecret: authenticator.generateSecret(),
    });
    sendOutcome(res, allOk);
  }
);

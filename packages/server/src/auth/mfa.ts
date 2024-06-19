import { allOk, badRequest } from '@medplum/core';
import { Login, Reference, User } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { asyncWrap } from '../async';
import { getAuthenticatedContext } from '../context';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { getSystemRepo } from '../fhir/repo';
import { authenticateRequest } from '../oauth/middleware';
import { verifyMfaToken } from '../oauth/utils';
import { sendLoginResult } from './utils';

authenticator.options = {
  window: 1,
};

export const mfaRouter = Router();

mfaRouter.get(
  '/status',
  authenticateRequest,
  asyncWrap(async (_req: Request, res: Response) => {
    const systemRepo = getSystemRepo();
    const ctx = getAuthenticatedContext();
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
  })
);

mfaRouter.post(
  '/enroll',
  authenticateRequest,
  [body('token').notEmpty().withMessage('Missing token')],
  asyncWrap(async (req: Request, res: Response) => {
    const systemRepo = getSystemRepo();
    const ctx = getAuthenticatedContext();
    const user = await systemRepo.readReference<User>(ctx.membership.user as Reference<User>);

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

    await systemRepo.updateResource({
      ...user,
      mfaEnrolled: true,
    });
    sendOutcome(res, allOk);
  })
);

mfaRouter.post(
  '/verify',
  [body('login').notEmpty().withMessage('Missing login'), body('token').notEmpty().withMessage('Missing token')],
  asyncWrap(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return Promise.resolve();
    }

    const systemRepo = getSystemRepo();
    const login = await systemRepo.readResource<Login>('Login', req.body.login);
    const result = await verifyMfaToken(login, req.body.token);
    return sendLoginResult(res, result);
  })
);

import { allOk, badRequest } from '@medplum/core';
import { User } from '@medplum/fhirtypes';
import { Request, Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticator } from 'otplib';
import { asyncWrap } from '../async';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { systemRepo } from '../fhir/repo';

authenticator.options = {
  window: 1,
};

export const mfaRouter = Router();

mfaRouter.get(
  '/status',
  asyncWrap(async (_req: Request, res: Response) => {
    let user = await systemRepo.readResource<User>('User', res.locals.user as string);
    if (user.authenticatorEnrolled) {
      res.json({ enrolled: true });
      return;
    }

    if (!user.authenticatorSecret) {
      user = await systemRepo.updateResource({
        ...user,
        authenticatorSecret: authenticator.generateSecret(),
      });
    }

    const accountName = `Medplum - ${user.email}`;
    const issuer = 'medplum.com';
    const secret = user.authenticatorSecret as string;
    const otp = authenticator.keyuri(accountName, issuer, secret);

    res.json({
      enrolled: false,
      enrollUri: otp,
    });
  })
);

mfaRouter.post(
  '/enroll',
  [body('token').notEmpty().withMessage('Missing token')],
  asyncWrap(async (req: Request, res: Response) => {
    const user = await systemRepo.readResource<User>('User', res.locals.user as string);

    if (user.authenticatorEnrolled) {
      sendOutcome(res, badRequest('Already enrolled'));
      return;
    }

    if (!user.authenticatorSecret) {
      sendOutcome(res, badRequest('Secret not found'));
      return;
    }

    const secret = user.authenticatorSecret as string;
    const token = req.body.token as string;
    if (!authenticator.check(token, secret)) {
      sendOutcome(res, badRequest('Invalid token'));
      return;
    }

    await systemRepo.updateResource({
      ...user,
      authenticatorEnrolled: true,
    });
    sendOutcome(res, allOk);
  })
);

mfaRouter.post(
  '/verify',
  [body('token').notEmpty().withMessage('Missing token')],
  asyncWrap(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    const user = await systemRepo.readResource<User>('User', res.locals.user as string);

    if (!user.authenticatorEnrolled) {
      sendOutcome(res, badRequest('Not enrolled'));
      return;
    }

    const secret = user.authenticatorSecret as string;
    const token = req.body.token as string;

    if (!authenticator.check(token, secret)) {
      sendOutcome(res, badRequest('Invalid token'));
      return;
    }

    sendOutcome(res, allOk);
  })
);

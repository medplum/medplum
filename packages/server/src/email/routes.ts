import { allOk, ContentType, forbidden } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, check, validationResult } from 'express-validator';
import { asyncWrap } from '../async';
import { invalidRequest, sendOutcome } from '../fhir/outcomes';
import { authenticateToken } from '../oauth/middleware';
import { sendEmail } from './email';
import { getRequestContext } from '../app';

export const emailRouter = Router();
emailRouter.use(authenticateToken);

const sendEmailValidators = [
  check('content-type').equals(ContentType.JSON),
  body('to').notEmpty().withMessage('To is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
];

emailRouter.post(
  '/send',
  sendEmailValidators,
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getRequestContext();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      sendOutcome(res, invalidRequest(errors));
      return;
    }

    // Make sure the user project has the email feature enabled
    if (!ctx.project.features?.includes('email')) {
      sendOutcome(res, forbidden);
      return;
    }

    // Use the user repository to enforce permission checks on email attachments
    await sendEmail(ctx.repo, req.body);
    sendOutcome(res, allOk);
  })
);

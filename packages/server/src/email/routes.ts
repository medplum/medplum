import { allOk, ContentType, forbidden } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, check } from 'express-validator';
import { asyncWrap } from '../async';
import { sendOutcome } from '../fhir/outcomes';
import { authenticateRequest } from '../oauth/middleware';
import { sendEmail } from './email';
import { getAuthenticatedContext } from '../context';
import { makeValidator } from '../util/validator';

export const emailRouter = Router();
emailRouter.use(authenticateRequest);

const sendEmailValidator = makeValidator([
  check('content-type').equals(ContentType.JSON),
  body('to').notEmpty().withMessage('To is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
]);

emailRouter.post(
  '/send',
  sendEmailValidator,
  asyncWrap(async (req: Request, res: Response) => {
    const ctx = getAuthenticatedContext();

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

import { allOk, ContentType, forbidden } from '@medplum/core';
import { Request, Response, Router } from 'express';
import { body, check } from 'express-validator';
import { asyncWrap } from '../async';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { authenticateRequest } from '../oauth/middleware';
import { makeValidationMiddleware } from '../util/validator';
import { sendEmail } from './email';

export const emailRouter = Router();
emailRouter.use(authenticateRequest);

const sendEmailValidator = makeValidationMiddleware([
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
    if (!ctx.project.features?.includes('email') || !ctx.membership.admin) {
      sendOutcome(res, forbidden);
      return;
    }

    // Use the user repository to enforce permission checks on email attachments
    await sendEmail(ctx.repo, req.body);
    sendOutcome(res, allOk);
  })
);

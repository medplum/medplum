// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, ContentType, badRequest } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, check } from 'express-validator';
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

emailRouter.post('/send', sendEmailValidator, async (req: Request, res: Response) => {
  const ctx = getAuthenticatedContext();

  if (!ctx.project.features?.includes('email')) {
    sendOutcome(res, badRequest('Email feature is not enabled for this project'));
    return;
  }

  if (!ctx.membership.admin) {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      id: 'forbidden',
      issue: [{ severity: 'error', code: 'forbidden', details: { text: 'Only project administrators can send emails' } }],
    };
    sendOutcome(res, outcome);
    return;
  }

  // Use the user repository to enforce permission checks on email attachments
  await sendEmail(ctx.repo, req.body);
  sendOutcome(res, allOk);
});

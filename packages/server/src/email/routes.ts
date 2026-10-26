// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, ContentType } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { body, check } from 'express-validator';
import type Mail from 'nodemailer/lib/mailer';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { makeValidationMiddleware } from '../util/validator';
import { sendEmail } from './email';
import { isEmailConfigured } from './utils';

export const emailRouter = Router();
emailRouter.use(authenticateRequest);

const sendEmailValidator = makeValidationMiddleware([
  check('content-type').equals(ContentType.JSON),
  body('to').notEmpty().withMessage('To is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('subject').isString().withMessage('Subject must be a string'),
  body('text').optional({ values: 'null' }).isString().withMessage('Text must be a string'),
  body('html').optional({ values: 'null' }).isString().withMessage('HTML must be a string'),
  body('attachments').optional({ values: 'null' }).isArray().withMessage('Attachments must be an array'),
  body('attachments.*').isObject().withMessage('Attachment must be an object'),
  body([
    'attachments.*.content',
    'attachments.*.path',
    'attachments.*.contentType',
    'attachments.*.contentDisposition',
    'attachments.*.cid',
    'attachments.*.encoding',
  ])
    .optional({ values: 'null' })
    .isString()
    .withMessage('Attachment properties must be strings'),
  body('attachments.*.filename')
    .optional({ values: 'null' })
    .custom((value) => typeof value === 'string' || value === false)
    .withMessage('Attachment filename must be a string'),
  body('icalEvent')
    .optional({ values: 'null' })
    .custom((value) => typeof value === 'string' || typeof value?.content === 'string')
    .withMessage('icalEvent must be a string or an object with string content'),
  body(['icalEvent.method', 'icalEvent.filename'])
    .optional({ values: 'null' })
    .isString()
    .withMessage('icalEvent properties must be strings'),
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
      issue: [
        { severity: 'error', code: 'forbidden', details: { text: 'Only project administrators can send emails' } },
      ],
    };
    sendOutcome(res, outcome);
    return;
  }

  if (!isEmailConfigured()) {
    sendOutcome(res, badRequest('Email is not configured on this server. Set up SMTP or AWS SES.'));
    return;
  }

  // Use the user repository to enforce permission checks on email attachments
  await sendEmail(ctx.repo, buildMailOptions(req.body, ctx.project.id), ctx.project);
  sendOutcome(res, allOk);
});

/**
 * Builds the nodemailer options from the validated request body.
 *
 * Only the documented MailOptions properties are copied; other options are ignored and logged.
 * @param reqBody - The validated request body.
 * @param projectId - The project ID, for logging.
 * @returns The nodemailer options.
 */
function buildMailOptions(reqBody: Record<string, any>, projectId: string): Mail.Options {
  const { from, sender, to, cc, bcc, replyTo, subject, text, html, attachments, icalEvent, ...rest } = reqBody;
  const ignored = Object.keys(rest);
  const options: Mail.Options = { from, sender, to, cc, bcc, replyTo, subject, text, html };

  if (attachments) {
    options.attachments = (attachments as Record<string, any>[]).map((attachment, index) => {
      const { filename, content, path, contentType, contentDisposition, cid, encoding, ...attachmentRest } = attachment;
      ignored.push(...Object.keys(attachmentRest).map((key) => `attachments[${index}].${key}`));
      return { filename, content, path, contentType, contentDisposition, cid, encoding };
    });
  }

  if (typeof icalEvent === 'string') {
    options.icalEvent = icalEvent;
  } else if (icalEvent) {
    const { method, filename, content } = icalEvent;
    options.icalEvent = { method, filename, content };
  }

  if (ignored.length > 0) {
    getLogger().warn('Ignoring unsupported email options', { projectId, options: ignored });
  }

  return options;
}

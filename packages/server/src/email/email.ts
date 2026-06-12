// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { EMPTY, normalizeErrorString } from '@medplum/core';
import type { Binary, Project } from '@medplum/fhirtypes';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { sendEmailViaSes } from '../cloud/aws/email';
import { getConfig } from '../config/loader';
import type { MedplumSmtpConfig } from '../config/types';
import type { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { getFromAddress, getProjectSmtpConfig } from './utils';

/**
 * Sends an email using the AWS SES service.
 * Builds the email using nodemailer MailComposer.
 * See options here: https://nodemailer.com/extras/mailcomposer/
 * @param repo - The user repository.
 * @param options - The MailComposer options.
 * @param project - Optional project for project-level SMTP configuration.
 */
export async function sendEmail(repo: Repository, options: Mail.Options, project?: WithId<Project>): Promise<void> {
  const config = getConfig();
  const projectSmtp = project ? getProjectSmtpConfig(project) : undefined;
  const fromAddress = getFromAddress(options, projectSmtp);

  options.from = fromAddress;
  options.sender = fromAddress;

  // Process attachments
  // For any FHIR Binary attachments, rewrite to a stream
  await processAttachments(repo, options.attachments);

  // Disable file access
  // "if set to true then fails with an error when a node tries to load content from a file"
  options.disableFileAccess = true;

  globalLogger.info('Sending email', { to: options.to, subject: options.subject, projectId: project?.id });

  if (projectSmtp) {
    await sendEmailViaSmtp(projectSmtp, options, project?.id);
  } else if (config.smtp) {
    await sendEmailViaSmtp(config.smtp, options);
  } else if (config.emailProvider === 'awsses') {
    await sendEmailViaSes(options);
  }
}

/**
 * Validates an array of nodemailer attachments.
 * @param repo - The user repository.
 * @param attachments - Optional array of nodemailer attachments.
 */
async function processAttachments(repo: Repository, attachments: Mail.Attachment[] | undefined): Promise<void> {
  for (const attachment of attachments ?? EMPTY) {
    await processAttachment(repo, attachment);
  }
}

/**
 * Validates a nodemailer attachment.
 * @param repo - The user repository.
 * @param attachment - The nodemailer attachment.
 */
async function processAttachment(repo: Repository, attachment: Mail.Attachment): Promise<void> {
  // MailComposer/nodemailer has many different ways to specify attachments.
  // See: https://nodemailer.com/message/attachments/
  // We only support HTTPS URLs and embedded content.
  // The most risky case is when the attachment is a file path,
  // because nodemailer will attempt to read the file from disk.
  const path = attachment.path;
  if (!path || typeof path !== 'string') {
    // No path is specified, so this is probably embedded content.
    return;
  }

  if (path.startsWith('Binary/')) {
    // This is a reference to a binary resource.
    // Validate that the user can read it
    const binary = await repo.readReference<Binary>({ reference: path });

    // Then get the Readable stream from the storage service.
    attachment.content = await getBinaryStorage().readBinary(binary);

    // And then delete the original path
    delete attachment.path;
  }
}

/**
 * Sends an email via SMTP.
 * @param smtpConfig - The SMTP configuration.
 * @param options - The nodemailer options.
 * @param projectId - Optional project ID when using project-level SMTP configuration.
 */
async function sendEmailViaSmtp(
  smtpConfig: MedplumSmtpConfig,
  options: Mail.Options,
  projectId?: string
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password,
    },
  });
  try {
    await transport.sendMail(options);
  } catch (err) {
    if (projectId) {
      globalLogger.error('Project SMTP send failed', {
        projectId,
        host: smtpConfig.host,
        port: smtpConfig.port,
        err: normalizeErrorString(err),
      });
    }
    throw err;
  }
}

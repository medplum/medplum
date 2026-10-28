// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, EMPTY, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { Binary, Project } from '@medplum/fhirtypes';
import { Readable } from 'node:stream';
import { createTransport } from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { detectExtension, detectMimeType } from 'nodemailer/lib/mime-funcs';
import { sendEmailViaSes } from '../cloud/aws/email';
import { getConfig } from '../config/loader';
import type { MedplumSmtpConfig } from '../config/types';
import type { Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { safeFetch } from '../util/url';
import { applyFromDisplayName, getFromAddress, getProjectAppName, getProjectSmtpConfig } from './utils';

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

  // The envelope sender stays a bare address; only the visible From header
  // carries the project's app name.
  options.from = applyFromDisplayName(fromAddress, projectSmtp ? getProjectAppName(project) : undefined);
  options.sender = fromAddress;

  try {
    // Process attachments
    // For any FHIR Binary or URL attachments, rewrite to a stream
    await processAttachments(repo, options.attachments);

    // Attachments are resolved above; nodemailer must not read files or URLs itself
    options.disableFileAccess = true;
    options.disableUrlAccess = true;

    globalLogger.info('Sending email', { to: options.to, subject: options.subject, projectId: project?.id });

    if (projectSmtp) {
      await sendEmailViaSmtp(projectSmtp, options, project?.id);
    } else if (config.smtp) {
      await sendEmailViaSmtp(config.smtp, options);
    } else if (config.emailProvider === 'awsses') {
      await sendEmailViaSes(options);
    } else {
      globalLogger.warn('Email not configured — skipping send', { to: options.to, subject: options.subject });
    }
  } finally {
    // Close streams that were not read, e.g. when an attachment or the send fails
    for (const attachment of options.attachments ?? EMPTY) {
      if (attachment.content instanceof Readable) {
        attachment.content.destroy();
      }
    }
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

  const binary = await readAttachmentBinary(repo, path);
  if (binary) {
    // Then get the Readable stream from the storage service.
    attachment.content = await getBinaryStorage().readBinary(binary);

    // And then delete the original path
    delete attachment.path;
  } else if (/^https?:\/\//i.test(path)) {
    attachment.content = await fetchAttachment(path);
    // Name the attachment as nodemailer does from the URL
    const name = new URL(path).pathname.split('/').pop();
    if (!attachment.filename && name) {
      attachment.filename = name.includes('.')
        ? name
        : `${name}.${detectExtension(attachment.contentType || detectMimeType(name))}`;
    }
    delete attachment.path;
  }
}

/**
 * Reads the Binary that an attachment path refers to, if any.
 * @param repo - The user repository.
 * @param path - The attachment path.
 * @returns The Binary, or undefined if the path does not refer to a Binary.
 */
async function readAttachmentBinary(repo: Repository, path: string): Promise<Binary | undefined> {
  if (path.startsWith('Binary/')) {
    // Validate that the user can read it
    return repo.readReference<Binary>({ reference: path });
  }

  const { storageBaseUrl } = getConfig();
  if (path.startsWith(storageBaseUrl)) {
    // This server's own storage URLs (e.g. a presigned Binary.url) are read like `Binary/` paths, since storage
    // may not be reachable by URL from the server. The read uses the user's own access, not the URL's signature.
    const [id = '', versionId] = path.slice(storageBaseUrl.length).split('?')[0].split('/').filter(Boolean);
    return versionId ? repo.readVersion<Binary>('Binary', id, versionId) : repo.readResource<Binary>('Binary', id);
  }

  return undefined;
}

/**
 * Fetches the content of a URL attachment.
 * @param url - The attachment URL.
 * @returns The response body stream.
 */
async function fetchAttachment(url: string): Promise<Readable> {
  try {
    // Limit only the wait for the response headers; nodemailer reads the body later
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await safeFetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Received status ' + response.status);
    }
    if (!response.body) {
      throw new Error('Received null response body');
    }
    return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  } catch (err) {
    throw new OperationOutcomeError(badRequest('Invalid email attachment: ' + normalizeErrorString(err)), {
      cause: err,
    });
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
  const transport = createTransport({
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import type Mail from 'nodemailer/lib/mailer';
import { getConfig } from '../config/loader';
import { sendEmail } from '../email/email';
import { extractEmailFromAddress } from '../email/utils';
import type { SystemRepository } from '../fhir/repo';
import { globalLogger } from '../logger';

/**
 * Values available to the welcome email template.
 * Extend this if the copy below needs more dynamic fields.
 */
export interface WelcomeEmailContext {
  /** The display name of the newly created project. */
  readonly projectName: string;
  /** The first name of the project owner, if known. */
  readonly firstName?: string;
  /** Base URL of the Medplum app, e.g. https://app.medplum.com/ */
  readonly appBaseUrl: string;
  /** Bare support email address, e.g. support@medplum.com (not the display-name form). */
  readonly supportEmail: string;
}

// ---------------------------------------------------------------------------
// EMAIL COPY — edit freely below.
//
// The welcome email is sent as plain text only — no HTML — so it reads like a
// normal, lightweight message rather than a formatted marketing email. Most
// clients auto-link the bare URLs. Just edit the wording below.
// ---------------------------------------------------------------------------

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Medplum';

export function welcomeEmailText(ctx: WelcomeEmailContext): string {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName}` : 'Hi';
  return `${greeting},

Welcome to Medplum! Your new project "${ctx.projectName}" is ready to go.

Here are a few things to help you get started:

- Sign in to your project: ${ctx.appBaseUrl}signin
- Read the docs: https://www.medplum.com/docs
    - Agentic Coding Guide: https://www.medplum.com/docs/building-with-ai-coding-assistants
    - Contribute: https://github.com/medplum/medplum#contributing
- Invite your teammates from the Admin panel: ${ctx.appBaseUrl}admin/users

If you have any questions, just reply to this email or reach out to us at
${ctx.supportEmail}. Also, join our community on Discord: https://discord.gg/medplum.

Thank you,
The Medplum Team
`;
}

// ---------------------------------------------------------------------------
// Delivery — you should rarely need to edit below this line.
// ---------------------------------------------------------------------------

/**
 * Builds the nodemailer options for the welcome email.
 *
 * Plain text only — no `html` part — so the message stays lightweight.
 *
 * The `from` address is intentionally NOT set here: `sendEmail` resolves it
 * from server settings (`supportEmail` / `approvedSenderEmails`) and any
 * project-level SMTP config. See getFromAddress() in email/utils.ts.
 *
 * @param to - Recipient email address.
 * @param ctx - Template context.
 * @returns The mail options.
 */
export function buildWelcomeEmail(to: string, ctx: WelcomeEmailContext): Mail.Options {
  return {
    to,
    subject: WELCOME_EMAIL_SUBJECT,
    text: welcomeEmailText(ctx),
  };
}

/**
 * Sends a welcome email to the owner of a newly created project.
 *
 * Failures are logged but never thrown: a mail delivery problem (e.g. SES not
 * configured on a self-hosted server) must not fail project registration.
 *
 * @param systemRepo - The system repository.
 * @param project - The newly created project.
 * @param user - The project owner.
 */
export async function sendWelcomeEmail(
  systemRepo: SystemRepository,
  project: WithId<Project>,
  user: User
): Promise<void> {
  if (!user.email) {
    return;
  }

  const config = getConfig();
  // config.supportEmail may be in display-name form (`"Medplum" <support@medplum.com>`);
  // use the bare address for the body copy.
  const supportEmail = extractEmailFromAddress(config.supportEmail) ?? config.supportEmail;
  const options = buildWelcomeEmail(user.email, {
    projectName: project.name ?? 'your project',
    firstName: user.firstName,
    appBaseUrl: config.appBaseUrl,
    supportEmail,
  });

  try {
    await sendEmail(systemRepo, options, project);
  } catch (err) {
    globalLogger.warn('Failed to send welcome email', {
      projectId: project.id,
      error: normalizeErrorString(err),
    });
  }
}

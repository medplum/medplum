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
// The body is hand-written in two forms that are sent together as a
// multipart/alternative message: plain text (welcomeEmailText, the fallback
// and what text-only clients + spam filters read) and HTML (welcomeEmailHtml,
// for rich clients). Keep the two in sync when editing the copy.
//
// No Markdown/HTML rendering library is used — the HTML is written by hand with
// inline styles only, since many email clients strip <head>/<style>. Keep the
// formatting light; email clients (Gmail, Outlook, Apple Mail) render
// inconsistently.
// ---------------------------------------------------------------------------

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Medplum';

export function welcomeEmailText(ctx: WelcomeEmailContext): string {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName}` : 'Hi';
  return `${greeting},

Welcome to Medplum! Your new project ${ctx.projectName} is ready to go.

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
// Rendering & delivery — you should rarely need to edit below this line.
// ---------------------------------------------------------------------------

/**
 * Escapes the HTML-significant characters so free-form values can't inject markup.
 * @param value - The raw string to escape.
 * @returns The HTML-escaped string.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders the welcome email as HTML.
 *
 * Free-form values (project name, first name) are HTML-escaped so they can't
 * inject markup. Trusted config values (app URL, support email) are used as-is.
 * Inline styles only — many email clients strip <head>/<style>. The list uses a
 * tightened indent and the container is left-aligned so the email reads plainly
 * rather than heavily "designed".
 * @param ctx - Template context.
 * @returns The HTML email body wrapped in a minimal inline-styled container.
 */
export function welcomeEmailHtml(ctx: WelcomeEmailContext): string {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)}` : 'Hi';
  const project = escapeHtml(ctx.projectName);
  const app = ctx.appBaseUrl;
  const support = ctx.supportEmail;
  const ul = 'margin: 4px 0; padding-left: 20px;';
  const li = 'margin: 2px 0;';
  const a = (url: string): string => `<a href="${url}">${url}</a>`;
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2937; max-width: 640px;">
<p>${greeting},</p>
<p>Welcome to Medplum! Your new project <strong>${project}</strong> is ready to go.</p>
<p>Here are a few things to help you get started:</p>
<ul style="${ul}">
<li style="${li}">Sign in to your project: ${a(`${app}signin`)}</li>
<li style="${li}">Read the docs: ${a('https://www.medplum.com/docs')}
<ul style="${ul}">
<li style="${li}">Agentic Coding Guide: ${a('https://www.medplum.com/docs/building-with-ai-coding-assistants')}</li>
<li style="${li}">Contribute: ${a('https://github.com/medplum/medplum#contributing')}</li>
</ul>
</li>
<li style="${li}">Invite your teammates from the Admin panel: ${a(`${app}admin/users`)}</li>
</ul>
<p>If you have any questions, just reply to this email or reach out to us at<br>
<a href="mailto:${support}">${support}</a>. Also, join our community on Discord: ${a('https://discord.gg/medplum')}.</p>
<p>Thank you,<br>The Medplum Team</p>
</div>`;
}

/**
 * Builds the nodemailer options for the welcome email.
 *
 * Both `text` and `html` are set so nodemailer sends a multipart/alternative
 * message: rich clients show the HTML, text-only clients (and spam filters) get
 * the plain-text part.
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
    html: welcomeEmailHtml(ctx),
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

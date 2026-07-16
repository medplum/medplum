// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Project, User } from '@medplum/fhirtypes';
import { marked } from 'marked';
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
// This is the entire body of the welcome email, written as Markdown. It is the
// single source of truth: it is rendered to HTML (for rich clients) and to
// plain text (fallback / text-only clients), and both are sent together as a
// multipart/alternative message.
//
// Markdown works as expected: **bold**, nested "- " bullets (indent by two
// spaces), and bare URLs/emails are auto-linked. Keep the formatting light —
// email clients (Gmail, Outlook, Apple Mail) render inconsistently.
// ---------------------------------------------------------------------------

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Medplum';

export function welcomeEmailMarkdown(ctx: WelcomeEmailContext): string {
  const greeting = ctx.firstName ? `Hi ${ctx.firstName}` : 'Hi';
  return `${greeting},

Welcome to Medplum! Your new project **${ctx.projectName}** is ready to go.

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
 * Renders the welcome email as plain text.
 * The Markdown source reads cleanly as text; we only strip the `**` bold markers
 * so they don't show up as literal asterisks.
 * @param ctx - Template context.
 * @returns The plain-text email body.
 */
export function welcomeEmailText(ctx: WelcomeEmailContext): string {
  return welcomeEmailMarkdown(ctx).replace(/\*\*/g, '');
}

/**
 * Renders the welcome email as HTML.
 *
 * Free-form values (project name, first name) are HTML-escaped before Markdown
 * rendering, since `marked` otherwise passes raw HTML through. Trusted config
 * values (app URL, support email) are left as-is so they auto-link.
 * @param ctx - Template context.
 * @returns The HTML email body wrapped in a minimal inline-styled container.
 */
export function welcomeEmailHtml(ctx: WelcomeEmailContext): string {
  const safeCtx: WelcomeEmailContext = {
    ...ctx,
    projectName: escapeHtml(ctx.projectName),
    firstName: ctx.firstName ? escapeHtml(ctx.firstName) : undefined,
  };
  const body = marked.parse(welcomeEmailMarkdown(safeCtx), { gfm: true, breaks: true, async: false });
  // Inline styles only — many email clients strip <head>/<style>. Keep it minimal.
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto;">${body}</div>`;
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

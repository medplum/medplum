---
sidebar_position: 11
tags: [auth]
---

# Project SMTP

By default, all emails sent on behalf of your project use the Medplum server's email provider and sender address. Projects can instead send email through their own SMTP relay (such as SendGrid, Mailgun, or Amazon SES SMTP) so that emails arrive from your own domain.

Project SMTP applies to all project-scoped emails. This includes emails sent via the [`sendEmail`](/docs/sdk/core.medplumclient.sendemail) API and system-generated emails for project-scoped users: user invites, password resets, email verification, and MFA reset notifications. The content of system-generated emails remains controlled by the Medplum server; project SMTP changes the transport and sender address. To customize email content, see [Custom Emails](/docs/user-management/custom-emails).

## Configuration

Project SMTP is configured by a Project Admin using [`Project.secret`](/docs/self-hosting/project-settings) entries. In the Medplum App, go to **Project Admin** → **Project** → **Secrets** and add the following entries:

| Secret name           | Type    | Required | Description                                                                              |
| --------------------- | ------- | -------- | ---------------------------------------------------------------------------------------- |
| `smtpHost`            | string  | yes      | SMTP relay hostname. Setting this activates project SMTP for all project-scoped emails. |
| `smtpPort`            | integer | yes      | SMTP relay port                                                                           |
| `smtpUsername`        | string  | yes      | SMTP username                                                                             |
| `smtpPassword`        | string  | yes      | SMTP password                                                                             |
| `smtpSecure`          | boolean | no       | Use TLS when connecting. If not specified, inferred from `smtpPort === 465`.             |
| `smtpFromAddress`     | string  | yes      | Default from address for emails sent through this relay                                   |
| `smtpApprovedSenders` | string  | no       | Comma-separated list of email addresses allowed as the from address                       |

## From address resolution

When project SMTP is active, emails are sent from `smtpFromAddress` by default. If the caller specifies a from address, it must appear in `smtpApprovedSenders` to be used; otherwise the project's default from address is used instead. The server-level approved sender list is only consulted when sending through the server transport.

## Failure behavior

If `smtpHost` is set but any required entry is missing or invalid, email sending for the project fails with an error rather than silently falling back to the server transport. This prevents system emails from being sent through an unintended transport with the wrong sender domain.

:::warning

A misconfigured project SMTP setup blocks **all** project-scoped emails, including password reset and email verification, until the secrets are corrected. Users who request a password reset during that window will not receive an email. After adding or changing the secrets, verify the configuration with a test send via the [`sendEmail`](/docs/sdk/core.medplumclient.sendemail) API before relying on it.

:::

## Self-hosting

Self-hosted operators can disable project SMTP fleet-wide by setting [`allowProjectSmtp`](/docs/self-hosting/server-config#allowprojectsmtp) to `false` in the server config. When disabled, all emails use the server-wide email provider regardless of project secrets.

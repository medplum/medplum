---
sidebar_position: 1100
---

# Testing Emails with Mailtrap

[Mailtrap.io](https://mailtrap.io/) provides a simple way to test outbound emails from your self-hosted SMTP server without sending them to real recipients. Instead, Mailtrap captures emails in a test inbox where you can review them.

Testing emails in a local development environment typically requires complex email authentication setup ([SPF](https://en.wikipedia.org/wiki/Sender_Policy_Framework), [DKIM](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [DMARC](https://en.wikipedia.org/wiki/DMARC)). Mailtrap eliminates this complexity by providing a sandboxed environment to verify email content and functionality.

## Prerequisites

1. Create a [Mailtrap account](https://mailtrap.io/register/signup?ref=header)
2. In the Mailtrap dashboard, select "Email Testing" from the left navigation
3. Click "Inboxes" and then select your inbox
4. In the Integration tab, find your SMTP credentials which include:
   - Host (sandbox.smtp.mailtrap.io)
   - Port (choose from available options: 25, 465, 587, or 2525)
   - Username
   - Password

## Configure Medplum Server

1. Open your Medplum server configuration file (default location for local development: `packages/server/medplum.config.json`)

2. Set your sender email address:
```json
"supportEmail": "support@example.com"
```

3. Add Mailtrap SMTP settings:
```json
"smtp": {
  "host": "sandbox.smtp.mailtrap.io",
  "port": 587,
  "username": "username",
  "password": "password"
}
```

## Testing

After saving the configuration, restart the Medplum server. All emails will now be sent to your Mailtrap inbox. You can test this by:
- [Inviting a new user](/docs/app/invite)
- Triggering a password reset

The emails will appear in your Mailtrap inbox instead of being delivered to actual recipients.

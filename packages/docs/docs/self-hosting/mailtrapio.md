---
sidebar_position: 1100
---

# Testing Emails with Mailtrap

[Mailtrap.io](https://mailtrap.io/) is an Email Delivery Platform built to help product companies ensure fast email delivery and high inboxing rates. It combines an intuitive interface for marketers to send impactful campaigns, a reliable API/SMTP services for developers, and a secure testing environment to ensure email quality before sending.

By acting as a dummy SMTP server, Mailtrap Email Sandbox eliminates the need for complex email authentication ([SPF](https://en.wikipedia.org/wiki/Sender_Policy_Framework), [DKIM](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [DMARC](https://en.wikipedia.org/wiki/DMARC)) in pre-production environments and provides a secure inbox to catch all test emails, allowing you to safely verify their content and functionality.

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

---
sidebar_position: 1100
---

# Testing emails with Mailtrap Email Sandbox

[Mailtrap.io](https://mailtrap.io/)  is an email platform for developer and product teams who need high inboxing rates and fast email delivery. It offers a flexible email API and a reliable SMTP service for developers to send transactional and bulk emails.

Also, Mailtrap provides a built-in Email Sandbox, which acts as a dummy SMTP server, capturing all outgoing emails. Teams can use it to catch test emails in an Email Sandbox, then inspect content, layout, HTML, and plain text versions. This way, they can make sure emails function correctly and fix any potential errors before messages reach real users.

## Prerequisites

1. Create a [Mailtrap account](https://mailtrap.io/register/signup?ref=header)
2. In the Mailtrap dashboard, select "Sandboxes" from the left navigation and then select your sandbox
4. In the Integration tab, find your SMTP credentials, which include:
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

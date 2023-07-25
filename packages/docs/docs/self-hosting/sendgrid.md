---
sidebar_position: 1100
---

# Send SMTP Emails with SendGrid

This page describes how to use [SendGrid](https://app.sendgrid.com/) as an [SMTP Relay](https://sendgrid.com/blog/smtp-relay-service-basics/) to send emails from Medplum.

:::note

SMTP email is only available when self-hosting Medplum.

Medplum's hosted environment uses [Amazon Simple Email Service (SES)](https://aws.amazon.com/ses/). Amazon SES is the default Medplum email provider.

:::

## Prerequisites

Be sure to perform the following prerequisites to complete this tutorial.

1. Sign up for a [SendGrid account](https://signup.sendgrid.com/)
2. Create and store a [SendGrid API key](https://app.sendgrid.com/settings/api_keys) with full access "Mail Send" permissions.
3. Verify your [SendGrid Sender Identity](https://docs.sendgrid.com/for-developers/sending-email/sender-identity/)

See the SendGrid [How to Send an SMTP Email](https://docs.sendgrid.com/for-developers/sending-email/getting-started-smtp) guide for step by step instructions.

## Configuring Medplum Server for SMTP

Open your Medplum server config file. When developing on localhost, the default config file location is `packages/server/medplum.config.json`.

Change the `supportEmail` to your Sender Identity email address:

```json
"supportEmail": "support@example.com",
```

Add a new `smtp` section for the SendGrid SMTP settings. Use your API key as the SMTP password:

```json
"smtp": {
  "host": "smtp.sendgrid.net",
  "port": 587,
  "username": "apikey",
  "password": "YOUR_API_KEY"
}
```

## Testing

Once your configuration settings are saved, restart the Medplum server. All subsequent emails will be sent via SendGrid SMTP Relay. For example, you can [invite a new user](/docs/app/invite) or reset your password to send a new email.

:::tip

If your SendGrid account is new, email delivery may be slow for the first 24 hours.

:::

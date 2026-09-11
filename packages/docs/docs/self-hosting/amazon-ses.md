---
sidebar_position: 1099
---

# Send Emails with Amazon SES

This page describes how to configure a self-hosted Medplum server to send email through [Amazon Simple Email Service (SES)](https://aws.amazon.com/ses/).

Amazon SES is Medplum's default email provider. Medplum uses email to verify identities, send login instructions, handle password reset requests, deliver MFA codes, and send messages from Bots via the `$send-email` operation.

:::note[]

If you would rather use an SMTP relay, see [Send SMTP Emails with SendGrid](/docs/self-hosting/sendgrid). Any SMTP provider works with the same `smtp` config block.

:::

## How Medplum chooses an email provider

When sending an email, Medplum server picks a provider in this order:

1. **Project SMTP** - if the Project has its own SMTP settings and [`allowProjectSmtp`](/docs/self-hosting/server-config#allowprojectsmtp) is enabled. See [Project SMTP](/docs/user-management/project-smtp).
2. **Server SMTP** - if the server config has an `smtp` block.
3. **Amazon SES** - if [`emailProvider`](/docs/self-hosting/server-config#emailprovider) is `awsses`.
4. **None** - the email is logged and skipped.

`emailProvider` defaults to `awsses` whenever no `smtp` block is present, so SES is used automatically unless you opt out. A server-level `smtp` block always takes precedence over SES, so remove it if you want SES.

## Prerequisites

1. **Verify a sending identity in SES.** Follow [Creating and verifying identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html). Verifying your whole domain is recommended so any address at that domain can send. At minimum, verify every address you plan to use in `supportEmail` and `approvedSenderEmails`.
2. **Configure DKIM and SPF.** Add the DNS records SES provides for your domain. Without them, mail is likely to land in spam.
3. **Request production access.** New SES accounts start in the [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html), which only allows sending to verified recipient addresses. This breaks user invites and password resets. Request production access before going live.
4. **Note the AWS Region** where the identity is verified. SES identities are regional, and Medplum must send from the same region.

## Configuring Medplum Server for SES

Open your Medplum server config. Depending on how you deploy, this is a JSON file, AWS Parameter Store entries, or `MEDPLUM_*` environment variables. See [Setting Configuration](/docs/self-hosting/setting-configuration) for details.

Set the following:

```json
{
  "emailProvider": "awsses",
  "awsRegion": "us-east-1",
  "supportEmail": "no-reply@example.com",
  "approvedSenderEmails": "no-reply@example.com,alerts@example.com"
}
```

| Setting                                                                         | Purpose                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`emailProvider`](/docs/self-hosting/server-config#emailprovider)               | Set to `awsses`. This is the default when no `smtp` block is present, so it can be omitted. Set to `none` to disable email entirely.                                                                                                                                       |
| [`awsRegion`](/docs/self-hosting/server-config#awsregion)                       | The region of your verified SES identity. Defaults to `us-east-1`. This setting is also used for other AWS integrations such as S3 storage and Lambda Bots, so all of them must live in the same region.                                                                   |
| [`supportEmail`](/docs/self-hosting/server-config#supportemail)                 | Required. The default `From` address for all system-generated email. Must be a verified SES identity, or an address at a verified domain.                                                                                                                                  |
| [`approvedSenderEmails`](/docs/self-hosting/server-config#approvedsenderemails) | Optional comma-separated allowlist. When a Bot or the `$send-email` operation supplies its own `From` address, it is only honored if it appears in this list. Otherwise the server logs a warning and falls back to `supportEmail`. Every address must be verified in SES. |

Make sure there is no `smtp` block in the config. If one is present it will be used instead of SES.

## IAM permissions

The IAM identity that the Medplum server runs as needs permission to send through SES:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:REGION:ACCOUNT_ID:identity/*"
    }
  ]
}
```

Replace `REGION` and `ACCOUNT_ID` with your values. You can narrow the resource to specific identity ARNs if you prefer.

- **Medplum CDK on AWS.** The [AWS install guide](/docs/self-hosting/install-on-aws) uses the Medplum CDK stack, which attaches this policy to the ECS task role automatically. No extra work is needed.
- **Other AWS deployments** such as EKS, EC2, or [Kubernetes](/docs/self-hosting/install-on-kubernetes). Attach the policy to the task role, instance profile, or IAM Role for Service Accounts (IRSA) that the server pods use.
- **Outside AWS.** Create an IAM user with this policy and provide its access key via the standard AWS SDK environment variables.

## Credentials

Medplum uses the [AWS SDK default credential provider chain](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html). No SES-specific credentials go in the Medplum config.

- On ECS, EC2, or EKS with IRSA, the attached role is picked up automatically.
- Elsewhere, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` if applicable) in the server's environment, or use `AWS_PROFILE` with a shared credentials file.

## Testing

Restart the Medplum server after saving the configuration. Then trigger an email, for example by [inviting a new user](/docs/app/invite) or requesting a password reset.

A successful send produces a log line at `info` level:

```
Sending email {"to":"user@example.com","subject":"Welcome to Medplum"}
```

## Troubleshooting

**`Email not configured — skipping send`** appears in the logs. `emailProvider` is `none`, or the value was not picked up. Check the config source that your deployment actually reads.

**`Error sending email: Email address is not verified`**. The `From` address is not a verified SES identity in the configured `awsRegion`. Verify the address or domain, and confirm the region matches.

**`Error sending email: ... MessageRejected ... not verified`** when sending to a recipient. Your SES account is still in the sandbox. Request production access.

**`Error sending email: ... AccessDenied` or `not authorized to perform: ses:SendRawEmail`**. The server's IAM identity is missing the policy above.

**Emails send but arrive in spam.** Configure DKIM and SPF for the sending domain, and consider a custom MAIL FROM domain in SES.

**Email goes through SMTP instead of SES.** A server-level `smtp` block or a Project-level SMTP configuration is present. Remove it, or set `allowProjectSmtp` to `false` to force the server-wide provider.

---
sidebar_position: 1000
---

# Running AWS Lambda Bots with Localhost

When developing for Medplum, you may want your **local Medplum Server** to trigger and execute **AWS Lambda-based Bots**. This setup allows you to test Lambda-specific behavior (like cold starts or resource limits) without deploying your entire server stack to the cloud.

### Architecture Overview

When configured this way, your local server acts as the "orchestrator," using your local AWS credentials to invoke Lambdas in your AWS environment.

## Setup Instructions

### 1. Configure AWS Credentials

Your local server needs permission to create and invoke Lambda functions. Medplum recommends using **AWS IAM Identity Center (SSO)** for secure access.

To authenticate with a specific profile:

```bash
aws sso login --profile medplum-dev

```

To verify your identity and ensure your session is active:

```bash
aws sts get-caller-identity --profile medplum-dev

```

> **Note:** If you aren't using SSO, ensure your `~/.aws/credentials` file is properly configured with an `access_key` and `secret_key`.

### 2. Configure the Medplum Server

Update your `packages/server/medplum.config.json` to point to the correct AWS resources.

```json
{
  "botLambdaRoleArn": "arn:aws:iam::123456789012:role/MedplumBotRole",
  "botLambdaLayerName": "medplum-bot-layer"
}
```

#### How to find these values:

The most efficient way to get these values is to pull them from an existing environment's **AWS Parameter Store**:

1. Open the **AWS Console** and navigate to **Systems Manager > Parameter Store**.
2. Look for the following keys (standard for Medplum deployments):

- `/medplum/staging/botLambdaRoleArn`
- `/medplum/staging/botLambdaLayerName`

### 3. Start the Local Server

When starting your server, you must explicitly pass the `AWS_PROFILE` so the AWS SDK can find your credentials.

```bash
# From the root of the medplum repository
AWS_PROFILE=medplum-dev npm run dev --workspace=packages/server
```

### 4. Deploy and Execute

Once the server is running with the correct configuration:

1. **Create/Open a Bot:** In your local Medplum web app (typically `localhost:3000`), navigate to your Bot.
2. **Set Runtime:** Ensure the `Bot.runtimeVersion` is set to `awslambda`.
3. **Deploy:** Click **"Deploy"**. The local server will now bundle your bot and upload it as a Lambda function to your AWS account.
4. **Execute:** Click **"Execute"**. You should see the execution logs in your local terminal and the Medplum UI.

## Troubleshooting

- **Permissions:** Ensure the IAM Role defined in `botLambdaRoleArn` has the `lambda:InvokeFunction` and `lambda:CreateFunction` permissions.
- **Region:** Ensure your `AWS_REGION` is correctly set in your environment variables or AWS config file.

## See Also

- [Medplum Bot Basics](/docs/bots/bot-basics)
- [Provisioning Bot Layers](/docs/bots/bot-lambda-layer)
- [AWS CLI Configuration Guide](https://docs.aws.amazon.com/cli/v1/userguide/cli-chap-configure.html)

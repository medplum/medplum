---
sidebar_position: 20
---

# External Lambda Functions

When running Medplum in AWS, Medplum uses AWS Lambdas to execute bot logic.

By default, Medplum manages the full AWS Lambda life cycle of create, update, deploy, and execute using a predefined AWS Lambda naming convention.

In a self hosted environment, you may want use your own AWS Lambda life cycle, your own naming conventions, or a third party management tool such as [Serverless Framework](https://www.serverless.com/) or [SST](https://sst.dev/). Medplum calls these "external functions".

This document describes how to enable and use external functions.

## Enable

Enable external functions by setting the `botCustomFunctionsEnabled` config setting to `true`.

For example, if using AWS Parameter Store for your configuration settings, you would create a new parameter called `/medplum/{environment}/botCustomFunctionsEnabled` with value `true`.

For more details, see the [Config Settings](/docs/self-hosting/config-settings) guide.

## Configure the bot

After the `botCustomFunctionsEnabled` config setting is set to `true`, the server will look for a FHIR Identifier with system `https://medplum.com/bot-external-function-id` for the AWS Lambda function name.

For example, consider this Bot:

```json
{
  "resourceType": "Bot",
  "identifier": [
    {
      "system": "https://medplum.com/bot-external-function-id",
      "value": "my-custom-lambda-function"
    }
  ],
  "name": "External Demo Bot",
  "runtimeVersion": "awslambda"
}
```

## Deploy the bot

When using external functions, the Medplum server is no longer involved with deploying the AWS Lambda. The `$deploy` endpoint is effectively a no-op.

## Execute the bot

Executing the bot is done exactly the same as with a normal Medplum-managed AWS Lambda, using either the `$execute` endpoint or a FHIR Subscription.

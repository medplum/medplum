---
sidebar_position: 1000
---

# Datadog Integration

This page describes how to add the Datadog agent to your ECS Fargate tasks. Adding Datadog allows you to collect metrics from all containers.

First, make sure you go through all steps in [Install on AWS](/docs/self-hosting/install-on-aws). You should have a Medplum CDK JSON config file and a running cluster.

To add Datadog to the ECS Fargate tasks, use the `additionalContainers` JSON property. For example:

```js
{
  "name": "staging",
  "region": "us-east-1",
  "stackName": "MedplumStagingStack",
  // ...
  "additionalContainers": [
    {
      "name": "datadog-agent",
      "image": "public.ecr.aws/datadog/agent:latest",
      "environment": {
        "DD_SITE": "datadoghq.com",
        "DD_API_KEY": "YOUR_API_KEY",
        "ECS_FARGATE": "true"
      }
    }
  ]
}
```

All three of the environment variables are required to successfully run the Datadog agent.

After you modify your Medplum CDK JSON config file, apply the changes using the CDK command line tools.

Run `diff` to see changes:

```bash
npx cdk diff -c config=my-config-file.json
```

Run `deploy` to apply changes:

```bash
npx cdk deploy -c config=my-config-file.json
```

For more details about the Datadog / Amazon ECS Fargate integration, refer to the full documentation: [https://docs.datadoghq.com/integrations/ecs_fargate/](https://docs.datadoghq.com/integrations/ecs_fargate/)

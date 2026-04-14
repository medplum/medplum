---
sidebar_position: 2
---

# Setting Medplum Server Configuration

There are two primary ways to configure the Medplum server when self-hosting: through a JSON configuration file or by using environment variables. This guide will walk you through both methods.

## JSON Configuration File

You can provide a path to a JSON file (e.g., `medplum.config.json`) when starting the Medplum server. This file contains all the necessary configuration settings.

### Example `medplum.config.json`

```json
{
  "baseUrl": "http://localhost:8103/",
  "port": 8103,
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

To start the server with this configuration, you would run:

```bash
nodepackages/server/dist/index.js medplum.config.json
```

## Environment Variables

All configuration settings can also be set using environment variables. This is common in containerized environments like Docker or cloud platforms like AWS, GCP, and Azure.

The environment variable names are prefixed with `MEDPLUM_`. The configuration keys are converted from `ALL_CAPS_SNAKE_CASE` to `camelCase`.

For example, the `baseUrl` setting becomes `MEDPLUM_BASE_URL`:

```bash
export MEDPLUM_BASE_URL="https://api.example.com/"
```

### Nested Objects

For nested JSON objects, the key names are combined. For example, the `database.host` key in the JSON file becomes the `MEDPLUM_DATABASE_HOST` environment variable.

Special prefixes are handled for common nested configurations:

- `MEDPLUM_DATABASE_...` maps to `database` config.
- `MEDPLUM_REDIS_...` maps to `redis` config.
- `MEDPLUM_SMTP_...` maps to `smtp` config.
- `MEDPLUM_FISSION_...` maps to `fission` config.

Here's how the example `medplum.config.json` from above would be represented as environment variables:

```bash
export MEDPLUM_BASE_URL="http://localhost:8103/"
export MEDPLUM_PORT=8103
export MEDPLUM_DATABASE_HOST="localhost"
export MEDPLUM_DATABASE_PORT=5432
export MEDPLUM_DATABASE_DBNAME="medplum"
export MEDPLUM_DATABASE_USERNAME="medplum"
export MEDPLUM_DATABASE_PASSWORD="medplum"
export MEDPLUM_REDIS_HOST="localhost"
export MEDPLUM_REDIS_PORT=6379
```

### Case Sensitivity and Underscores

It is important to pay attention to underscores when converting camelCase configuration keys to environment variables. The system converts environment variables to configuration keys using the following logic:

1. Remove the `MEDPLUM_` prefix.
2. Identify any special section prefix (e.g., `DATABASE_`, `REDIS_`).
3. Convert the remaining string to lower case.
4. Replace `_` followed by a letter with the uppercase version of that letter.

:::warning Common Pitfall
Missing underscores in the environment variable name will result in incorrect configuration keys.

For example, the configuration setting `database.maxConnections` corresponds to `MEDPLUM_DATABASE_MAX_CONNECTIONS`.

- **Correct:** `MEDPLUM_DATABASE_MAX_CONNECTIONS` -> `database.max_connections` -> `database.maxConnections`
- **Incorrect:** `MEDPLUM_DATABASE_MAXCONNECTIONS` -> `database.maxconnections` (Note the lowercase 'c')

If you accidentally use `MEDPLUM_DATABASE_MAXCONNECTIONS`, the server will ignore the setting because it looks for `maxConnections`, not `maxconnections`.
:::

When both a configuration file and environment variables are present, the environment variables will take precedence. This allows you to have a base configuration file and override specific settings for different environments.

## AWS Systems Manager (SSM) Parameter Store

When running in AWS, Medplum server can load config settings from AWS Systems Manager (SSM) Parameter Store. This is the recommended approach for AWS deployments as it allows for secure management of secrets and configuration decoupling.

### Naming Convention

When creating a parameter in AWS Parameter Store, the parameter **Name** must follow the convention `/medplum/{environmentName}/{key}`.

- `{environmentName}`: The name of your environment (e.g., `dev`, `staging`, `prod`).
- `{key}`: The configuration setting key (e.g., `baseUrl`, `database.ssl.require`).

For example, if your environment name is "staging", the `baseUrl` parameter name would be `/medplum/staging/baseUrl`.

### Automated Parameters (CDK)

When you deploy Medplum using the AWS CDK (Cloud Development Kit), the stack automatically creates several parameters in the SSM Parameter Store for you. These include:

- `/medplum/{environmentName}/awsRegion`: The AWS region where the stack is deployed.
- `/medplum/{environmentName}/DatabaseSecrets`: The ARN of the AWS Secrets Manager secret containing the database credentials.
- `/medplum/{environmentName}/RedisSecrets`: The ARN of the AWS Secrets Manager secret containing the Redis credentials.
- `/medplum/{environmentName}/botLambdaRoleArn`: The ARN of the IAM role used by Medplum Bots.
- `/medplum/{environmentName}/databaseProxyEndpoint`: (Optional) The endpoint for the RDS Proxy, if enabled.

These parameters are critical for the server's operation and are managed by the CDK.

### Manual Parameters

You can add any other configuration setting to the Parameter Store manually. Common settings to add manually include:

- `/medplum/{environmentName}/baseUrl`
- `/medplum/{environmentName}/appBaseUrl`
- `/medplum/{environmentName}/storageBaseUrl`
- `/medplum/{environmentName}/googleClientId`
- `/medplum/{environmentName}/googleClientSecret`

Medplum supports both "String" and "SecureString" parameter types. "SecureString" is recommended for sensitive values like client secrets or API keys.

For more information, refer to the AWS documentation on [creating Systems Manager parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-create-console.html).

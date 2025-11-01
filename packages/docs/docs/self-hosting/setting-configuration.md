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

The environment variable names are prefixed with `MEDPLUM_`, and the configuration keys are converted from camelCase to ALL_CAPS_SNAKE_CASE.

For example, the `baseUrl` setting becomes `MEDPLUM_BASE_URL`:
```bash
export MEDPLUM_BASE_URL="https://api.example.com/"
```

### Nested Objects

For nested JSON objects, the key names are combined. For example, the `database.host` key in the JSON file becomes the `MEDPLUM_DATABASE_HOST` environment variable.

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

When both a configuration file and environment variables are present, the environment variables will take precedence. This allows you to have a base configuration file and override specific settings for different environments.

## AWS

When running in AWS, Medplum server can load config settings from AWS Systems Manager (SSM) Parameter Store. This is the recommended approach for AWS deployments as it allows for secure management of secrets.

When creating a parameter in AWS Parameter Store, the parameter **Name** should follow the convention `/medplum/{environmentName}/{key}`.

For example, if your environment name is "staging", the `baseUrl` parameter name would be `/medplum/staging/baseUrl`.

Medplum supports both "String" and "SecureString" parameter types. "SecureString" is recommended for sensitive values.

For more information, refer to the AWS documentation on [creating Systems Manager parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-create-console.html).
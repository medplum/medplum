---
sidebar_position: 50
---

# Server Config

When running Medplum server on a local developer machine, Medplum server typically loads config settings from a JSON config file. By default, it loads config settings from `medplum.config.json`.

When running in AWS, Medplum server loads config settings from AWS Parameter Store, a feature of AWS Systems Manager (SSM).

Some configuration settings are created automatically by the CDK deployment (for example, database and redis connection details). Other settings must be created manually before the first deploy.

Learn more in the [Create a Systems Manager parameter](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-create-console.html) AWS user guide.

![AWS Create Parameter](./aws-create-parameter.png)

When creating a parameter in AWS Parameter Store, you will be prompted for the parameter **Name**. The parameter **Name** uses the convention `/medplum/{environmentName}/{key}`.

For example, if your environment name is "prod", then the "baseUrl" parameter name is `/medplum/prod/baseUrl`.

You will also be prompted for a parameter "Type". The default option is "String". Medplum supports both "String" and "SecureString". "SecureString" is recommended for security and compliance purposes.

Optionally override the trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla.

### port (required)

The port number that the API server binds to inside the Docker image. By default, you should use `8103`. In some cases, you may need to use `5000`.

**Created by:** `init`
**Default:** `8103`

### baseUrl (required)

The fully qualified base URL of the API server including a trailing slash. For example, `https://api.example.com/`.

**Created by:** `init`
**Default:** None

### appBaseUrl (required)

The fully qualified URL of the user-facing app. This is used for CORS and system generated emails. For example, `https://app.example.com/`.

**Created by:** `init`
**Default:** None

### binaryStorage (required)

Where to store binary contents. This should be the CDK config `storageBucketName` with `s3:` prefix. For example, `s3:medplum-storage`.

**Created by:** `init`
**Default:** None

### storageBaseUrl (required)

The fully qualified base URL of the binary storage. This should be the CDK config `storageDomainName` with `https://` prefix. For example, `https://storage.medplum.com/binary/`.

**Created by:** `init`
**Default:** None

### signingKeyId (required)

The AWS key ID of the CloudFront signing key that you created before.

See [/docs/self-hosting/presigned-urls] to setup presigned URLs.

**Created by:** `cdk`
**Default:** None

### signingKey (required)

The private key of the CloudFront signing key.

See [/docs/self-hosting/presigned-urls] to setup presigned URLs.

**Created by:** `init`
**Default:** None

### signingKeyPassphrase (required)

The passphrase of the CloudFront signing key.

See [/docs/self-hosting/presigned-urls] to setup presigned URLs.

**Created by:** `init`
**Default:** None

### supportEmail (required)

The email address to use when sending system generated messages. This email address must be registered in AWS SES.

**Created by:** `init`
**Default:** None

### logLevel

Verbosity of logging: `'NONE'`, `'ERROR'`, `'WARN'`, `'INFO'`, `'DEBUG'`

**Default:** `'INFO'`

### allowedOrigins

Optional comma separated list of allowed origins for [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) requests. `appBaseUrl` is included automatically. See [Setting Up CORS](/docs/self-hosting/setting-up-cors) for more details.

**Default:** None

### issuer

The JWK issuer. By default, Medplum server uses built in OAuth, so `issuer` should be the same as `baseUrl`.

**Default:** `baseUrl`

### jwksUrl

The JWKS URL. By default, Medplum server uses built in OAuth, so `jwksUrl` should be `baseUrl` + `.well-known/jwks.json`.

**Default:** `baseUrl` + `.well-known/jwks.json`

### authorizeUrl

The OAuth authorize URL. By default, Medplum server uses built in OAuth, so `authorizeUrl` should be `baseUrl` + `oauth2/authorize`.

**Default:** `baseUrl` + `oauth2/authorize`

### tokenUrl

The OAuth token URL. By default, Medplum server uses built in OAuth, so `tokenUrl` should be `baseUrl` + `oauth2/token`.

**Default:** `baseUrl` + `oauth2/token`

### userInfoUrl

The OAuth userinfo URL. By default, Medplum server uses built in OAuth, so `userInfoUrl` should be `baseUrl` + `oauth2/userinfo`.

**Default:** `baseUrl` + `oauth2/userinfo`

### googleClientId

If using Google Authentication, this is the Google Client ID.

**Default:** None

### googleClientSecret

If using Google Authentication, this is the Google Client Secret.

**Default:** None

### recaptchaSiteKey

If using reCAPTCHA, this is the reCAPTCHA site key.

**Default:** None

### recaptchaSecretKey

If using reCAPTCHA, this is the reCAPTCHA secret key.

**Default:** None

### botLambdaRoleArn

If using Medplum Bots, this is the ARN of the [Lambda execution role](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html). See [Bot Lambda Layer](/docs/bots/bot-lambda-layer) for more details.

**Created by:** `cdk`
**Default:** None

### botLambdaLayerName

If using Medplum Bots, this is the name of the [Lambda layer](https://docs.aws.amazon.com/lambda/latest/dg/invocation-layers.html). For example, `medplum-bot-layer`. See [Bot Lambda Layer](/docs/bots/bot-lambda-layer) for more details.

**Default:** `medplum-bot-layer`

### database

The database connection details as a JSON object. Only available when using JSON config file.

**Default:** None

### database.ssl.ca

Optional trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla. This can be used with `DatabaseSecrets`.

**Default:** None

### database.ssl.rejectUnauthorized

Optional boolean flag to reject any connection which is not authorized with the list of supplied CAs. This can be used with `DatabaseSecrets`.

**Default:** `true`

### database.ssl.require

Optional boolean flag to require SSL when connecting to the database. This can be used with `DatabaseSecrets`.

**Default:** `false`

### databaseProxyEndpoint (deprecated)

Optional database proxy URL, for example to use AWS RDS Proxy. This can be used with `DatabaseSecrets`. This setting is deprecated; instead set `database.host` to the RDS Proxy endpoint and `database.ssl.require` to `true`.

**Default:** None

### DatabaseSecrets

The AWS Secret ID containing database connection details (created automatically by CDK). Only available when using AWS Parameter Store config. See [AWS Secrets](#aws-secrets).

**Created by:** `cdk`
**Default:** None

### readonlyDatabase

Optional database connection details to a read-only database that will be used for certain readonly search & GQL operations.

**Default:** None

### readonlyDatabase.ssl.ca

Optional trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla. This can be used with `DatabaseSecrets`.

**Default:** None

### readonlyDatabase.ssl.rejectUnauthorized

Optional boolean flag to reject any connection which is not authorized with the list of supplied CAs. This can be used with `DatabaseSecrets`.

**Default:** `true`

### readonlyDatabase.ssl.require

Optional boolean flag to require SSL when connecting to the readonly database. This can be used with `DatabaseSecrets`.

**Default:** `false`

### readonlyDatabaseProxyEndpoint (deprecated)

Optional database proxy URL, for example to use AWS RDS Proxy. This can be used with `DatabaseSecrets`. This setting is deprecated; instead set `database.host` to the RDS Proxy endpoint and `database.ssl.require` to `true`.

**Default:** None

### redis

The redis connection details as a JSON object. Only available when using JSON config file.

**Default:** None

### RedisSecrets

The AWS Secret ID containing Redis connection details (created automatically by CDK). Only available when using AWS Parameter Store config. See [AWS Secrets](#aws-secrets).

**Created by:** `cdk`
**Default:** None

### logRequests

Optional flag to log individual HTTP requests.

**Default:** `false`

### saveAuditEvents

Optional flag to save `AuditEvent` resources for all auth and RESTful operations in the database.

**Default:** `false`

### logAuditEvents

Optional flag to log `AuditEvent` resources for all auth and RESTful operations to the logger.

**Default:** `false`

### auditEventLogGroup

Optional AWS CloudWatch Log Group name for `AuditEvent` logs. If not specified, `AuditEvent` logs use the default logger.

**Default:** None

### auditEventLogStream

Optional AWS CloudWatch Log Stream name for `AuditEvent` logs. Only applies if `auditEventLogGroup` is set. Uses `os.hostname()` as the default.

**Default:** `os.hostname()`

### registerEnabled

Optional flag whether new user registration is enabled. See [Open Patient Registration](/docs/user-management/open-patient-registration) for more details.

**Default:** `true`

### mfaAuthenticatorWindow

Optional TOTP authenticator window for MFA token validation. This controls how many time steps (each 30 seconds) are accepted before and after the current time. A higher value is more lenient but less secure.

| Value | Time Tolerance                     |
| ----- | ---------------------------------- |
| 0     | Only current 30-second window      |
| 1     | ±30 seconds (~90 sec total)        |
| 2     | ±60 seconds (~150 sec total)       |

**Default:** `1`

### maxJsonSize

Maximum JSON size for API calls. String is parsed with the [bytes](https://www.npmjs.com/package/bytes) library. Default is `1mb`.

**Default:** `1mb`

### maxBatchSize

Maximum batch size for API calls. String is parsed with the [bytes](https://www.npmjs.com/package/bytes) library.

**Default:** `50mb`

### smtp

Optional SMTP email settings to use SMTP for email. See [Sending SMTP Emails](/docs/self-hosting/sendgrid) for more details.

**Default:** None

### emailProvider

Optional email provider setting. Can be one of: `'none'`, `'awsses'`, `'smtp'`.

**Default:** `'awsses'` if in AWS, otherwise `'none'`

### bullmq

Optional BullMQ configuration.

#### bullmq.concurrency

Amount of jobs that a single worker is allowed to work on in parallel.
See [BullMQ Worker Concurrency](https://docs.bullmq.io/guide/workers/concurrency).

**Default:** `1`

#### bullmq.removeOnComplete

Configuration for removing jobs from the queue when they are completed.
See [BullMQ Job Removal](https://docs.bullmq.io/guide/jobs/auto-removal).

**Default:** `false`

#### bullmq.removeOnFail

Configuration for removing jobs from the queue when they fail.
See [BullMQ Job Removal](https://docs.bullmq.io/guide/jobs/auto-removal).

**Default:** `false`

### awsRegion

The AWS Region identifier.

**Created by:** `cdk`
**Default:** `us-east-1`

### accurateCountThreshold

Optional threshold for accurate count queries. The server will always perform an estimate count first (to protect database performance), and an accurate count if the estimate is below this threshold.

**Default:** `1000000`

### maxSearchOffset

Optional max offset for search queries.

**Default:** `10000`

### defaultBotRuntimeVersion

Optional default bot runtime version. See [Bot runtime version](/docs/api/fhir/medplum/bot) for more details.

**Default:** `awslambda`

### defaultProjectFeatures

Optional default project features. See [Project Settings](/docs/access/projects#settings)

### defaultProjectSystemSetting

Optional default project system settings. See [Project System Settings](/docs/self-hosting/project-settings#project-system-settings)

**Created by:** `init`
**Default:** None

### maxBotLogLengthForResource

Optional max `AuditEvent.outcomeDesc` length for Bot events saved as a resource in the database.

**Default:** `10 kb`

### maxBotLogLengthForLogs

Optional max `AuditEvent.outcomeDesc` length for Bot events sent to logger.

**Default:** `10 kb`

### defaultRateLimit

Limit for the rate at which requests can be sent to or processed by the server. For more details see the [Rate Limit docs](/docs/rate-limits).

**Default:** `60000/minute`

### defaultAuthRateLimit

Limit for the rate at which auth requests can be sent to or processed by the server. If developers are hitting this limit, it could be an indication of a suboptimal integration where each request is authenticating rather than reusing a token. For more details see the [Rate Limit docs](/docs/rate-limits).

**Default:** `60/minute`

### defaultFhirQuota

Limit for the total number of FHIR request that can be sent to to processed by the server. For more default see the [Rate Limit docs](/docs/rate-limits)

**Default:** `50000`

:::tip Local Config
To make changes to the server config after your first deploy, you must the edit parameter values _directly in AWS parameter store_

To make changes to settings that affect your deployed Medplum App, you must _also_ make these changes to your local configuration json file.

Once you have made these changes, you will need to restart your server for them to take effect. The easiest way to do this in a zero-downtime manner is by using the `medplum aws update-server` command. For more details on this command see the [Upgrade the Server docs](/docs/self-hosting/install-on-aws#upgrade-the-server).
:::

### autoDownloadEnabled

Optional flag to enable automatic download of resources when they are requested. This is useful for large resources that are not needed immediately, such as images or videos.

Downloaded content will be stored as a FHIR `Binary` resource, and the `contentUrl` will be updated accordingly.

This feature can be disabled if you want to preserve the original external URL of the resource, or if you want to control the download process manually.

**Default:** `true`

### redactAuditEvents

If set, removes human-readable details from AuditEvent resources saved to the database and written to server logs.
This removes personal information such as patient names and clinical descriptions from the events, rendering them safer
for storage, while retaining the opaque, machine-readable identifiers.

**Default:** `false`

### introspectUrl

The OAuth introspection URL. By default, Medplum server uses built in OAuth, so `introspectUrl` should be `baseUrl` + `oauth2/introspect`.

**Default:** `baseUrl` + `oauth2/introspect`

### registerUrl

The OAuth registration URL. By default, Medplum server uses built in OAuth, so `registerUrl` should be `baseUrl` + `oauth2/register`.

**Default:** `baseUrl` + `oauth2/register`

### approvedSenderEmails

Optional comma separated list of approved sender email addresses for AWS SES.

**Default:** None

### bcryptHashSalt

Work factor for bcrypt password hashing.

**Default:** `10`

### introspectionEnabled

Enable OAuth introspection endpoint.

**Default:** `true`

### keepAliveTimeout

Node.js server keep-alive timeout in milliseconds.

**Default:** None

### vmContextBotsEnabled

Enable VM Context (local) bots.

**Default:** `false`

### vmContextBaseUrl

Base URL for VM Context bots.

**Default:** None

### shutdownTimeoutMilliseconds

Graceful shutdown timeout in milliseconds.

**Default:** `30000`

### heartbeatMilliseconds

Heartbeat interval in milliseconds.

**Default:** None

### heartbeatEnabled

Enable heartbeat.

**Default:** `false`

### defaultSuperAdminEmail

Default super admin email address. If specified, and no users exist, this user will be created as a super admin.

**Default:** None

### defaultSuperAdminPassword

Default super admin password.

**Default:** None

### defaultSuperAdminClientId

Default super admin client ID.

**Default:** None

### defaultSuperAdminClientSecret

Default super admin client secret.

**Default:** None

### transactionAttempts

Number of attempts for transactions that fail due to retry-able transaction errors.

**Default:** None

### transactionExpBackoffBaseDelayMs

Number of milliseconds to use as a base for exponential backoff in transaction retries.

**Default:** None

### preCommitSubscriptionsEnabled

Flag to enable pre-commit subscriptions for the interceptor pattern.

**Default:** `false`

### externalAuthProviders

Optional list of external authentication providers for [Direct External Authentication](/docs/auth/direct-external-auth). Each entry allows users with JWTs from the specified issuer to authenticate directly against the Medplum API without a token exchange.

Each provider object has the following properties:

| Property | Type | Description |
| :--- | :--- | :--- |
| `issuer` | `string` | The expected `iss` claim in JWTs from this IDP. Must match exactly. |
| `userInfoUrl` | `string` | The IDP's userinfo endpoint URL, used to validate tokens. |

Example configuration:

```json
{
  "externalAuthProviders": [
    {
      "issuer": "https://auth.example.com",
      "userInfoUrl": "https://auth.example.com/oauth2/userinfo"
    }
  ]
}
```

When a user presents a JWT with a matching `iss` claim, the server validates the token against the IDP's userinfo endpoint, then identifies the user via the `fhirUser` claim or falls back to matching the `sub` claim against `ProjectMembership.externalId`. See [Direct External Authentication](/docs/auth/direct-external-auth) for full details.

**Default:** None

### defaultOAuthClients

Optional list of default OAuth2 clients. These clients are used for [OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591) via the `/oauth2/register` endpoint. When a client attempts to register with a redirect URI that matches one of these default clients, the server will return the pre-configured client credentials.

This is particularly useful for MCP (Model Context Protocol) clients like Claude Code, which use dynamic client registration to obtain OAuth credentials.

**Format:** Array of `ClientApplication` objects with the following properties:
- `resourceType`: Must be `"ClientApplication"`
- `id`: Unique client identifier
- `name`: Human-readable client name
- `secret`: Client secret (optional but recommended)
- `redirectUris`: Array of allowed redirect URIs (must match exactly what the client sends during registration)

**Example:**

```json
{
  "defaultOAuthClients": [
    {
      "resourceType": "ClientApplication",
      "id": "claude-code",
      "name": "Claude Code",
      "secret": "your-secure-secret-here",
      "redirectUris": ["https://claude.ai/oauth/callback"]
    }
  ]
}
```

**Default:** None

### mcpEnabled

Optional flag to enable the MCP server beta.

**Default:** `false`

### fission

Optional config for Fission.io bots.

**Default:** None

### fhirSearchMinLimit

Optional minimum LIMIT N for queries generated by FHIR searches.

**Default:** None

### fhirSearchDiscourageSeqScan

Optional flag to discourage seqscan query plans for queries generated by FHIR searches.

**Default:** `false`

### botCustomFunctionsEnabled

Optional flag to enable custom functions in Bots.

**Default:** `false`

### AWS Secrets

Postgres and Redis connection details have special cases due the way CDK exposes them.

When using a JSON config file, use JSON objects for `database` and `redis`. For example:

```json
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum"
  },
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "medplum"
  }
```

When using AWS Parameter Store config, instead use `DatabaseSecrets` and `RedisSecrets`. The value of these properties is the Secret ID in AWS Secrets Manager. This design is for CDK. When CDK creates an RDS cluster or Elasticache cluster, the connection details are published in AWS Secrets Manager.

If you choose to "bring your own database" or "bring your own redis", you can specify your own Secret ID in those settings. The secret in AWS Secrets Manager must have the expected layout.

Example `DatabaseSecrets` value:

```json
{
  "dbClusterIdentifier": "my-cluster",
  "password": "password",
  "dbname": "medplum",
  "engine": "postgres",
  "port": 5432,
  "host": "my-cluster.us-east-1.rds.amazonaws.com",
  "username": "clusteradmin",
  "queryTimeout": 60000
}
```

:::note Query Timeout
The `queryTimeout` parameter controls how long the database will allow a query to run before terminating it. If this
parameter is set too high, expensive queries will be allowed to run on the DB, potentially even after the associated
request has returned a server timeout error. If set too low, some queries may start to fail if they hit the
new timeout.

To disable the timeout, set it to `0`.
:::

Example `RedisSecrets` value:

```json
{
  "password": "password",
  "port": "6379",
  "host": "my-cluster.cache.amazonaws.com",
  "tls": {}
}
```

### External Secrets

Some users may want to load their config parameters from an external provider, such as the `AWS Parameter Store`.
Medplum allows all CDK config settings (minus `region`) to be configured as `external secrets` by replacing the value with a JSON object with the following schema:

```js
{
  "system": "<system_name>", // can be one of: ["aws_ssm_parameter_store"]
  "key": "<key_to_access_secret>", // the key to access the secret at
  "type": "<string | number | boolean>" // the primitive data type for the secret, used for coercing strings to native primitive types
}
```

Example config with `external secrets`:

```js
{
  "region": "us-east-1",
  "apiPort": {
    "system": "aws_ssm_parameter_store",
    "key": "apiPort",
    "type": "number"
  }
}
```

Any parameter specified in the `external secrets` format will automatically be fetched at deployment time, right before the `CloudFormation` stack is created. This both keeps your secrets safe and also reduces the amount of manual maintenance you must perform on your Medplum configuration over the lifetime of your application.

### Database SSL Configuration

Medplum server can be configured to require an SSL connection to the database. There are three notable configuration settings for this:

1.  `database.ssl.require` - Optional boolean flag to require SSL when connecting to the database.
2.  `database.ssl.ca` - Optional trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla.
3.  `database.ssl.rejectUnauthorized` - Optional boolean flag to reject any connection which is not authorized with the list of supplied CAs.

In general, the `require` flag should be set to `true` to ensure that all connections to the database are encrypted. The `ca` and `reactUnauthorized` flags are optional and can be used to further secure the connection.

Example using JSON configuration file:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum",
    "ssl": {
      "require": true,
      "rejectUnauthorized": true
    }
  }
}
```

Example using AWS Parameter Store configuration:

| Key                                             | Value                     |
| ----------------------------------------------- | ------------------------- |
| `/medplum/prod/database.ssl.require`            | `true`                    |
| `/medplum/prod/database.ssl.rejectUnauthorized` | `true`                    |
| `/medplum/prod/database.ssl.ca`                 | Certificate in PEM format |

When using SSL with AWS RDS, you must add the RDS CA certificate to the `ca` setting. The RDS CA certificate can be downloaded from the [AWS documentation](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).

Note that AWS Parameter Store parameters have a 4096 character limit. The RDS CA bundle is larger than the 4096 character limit, so you must find the individual certificate. To find your RDS CA certificate within a bundle, use the `keytool` command to inspect the bundle:

```sh
keytool -list -keystore rds-combined-ca-bundle.pem
```

Alternatively, you can use `rejectUnauthorized` = `false` to disable SSL verification. This will still use SSL encryption, but will not verify the certificate.

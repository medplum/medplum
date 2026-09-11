---
sidebar_position: 7
---

# Install on DigitalOcean

This guide covers the DigitalOcean-specific steps for running the Medplum API server. For production deployments, use DigitalOcean Managed PostgreSQL and Managed Redis rather than running databases inside the application container.

:::caution[]

DigitalOcean App Platform is a convenient way to run the Medplum API server, but it does not host the Medplum web app automatically. Deploy the web app separately and set `MEDPLUM_APP_BASE_URL` to that URL.

:::

## Deployment Options

There are two common ways to run Medplum on DigitalOcean:

- **Droplet:** Create an Ubuntu droplet and follow the [Install on Ubuntu](/docs/self-hosting/install-on-ubuntu) guide. Use DigitalOcean firewall rules to allow SSH, HTTP, and HTTPS traffic.
- **App Platform:** Deploy the Medplum API server from your Medplum repository fork, and connect it to DigitalOcean Managed PostgreSQL and Managed Redis.

The rest of this guide focuses on App Platform.

## Prerequisites

Before creating the App Platform app:

1. Create a DigitalOcean Managed PostgreSQL database.
2. Create a DigitalOcean Managed Redis database.
3. Create or fork a repository that contains the Medplum source code.
4. Choose the API server domain, such as `https://api.example.com/`.
5. Choose the web app domain, such as `https://app.example.com/`.

## Create the App

In DigitalOcean App Platform, create a new app from your Medplum repository and select the branch to deploy.

Configure the service as a Node.js application:

```bash
npm ci --include=dev
npx turbo run build --filter=@medplum/server
```

Use this run command:

```bash
node --import ./packages/server/dist/otel/instrumentation.js packages/server/dist/index.js env
```

Set the App Platform HTTP port to the same value as `MEDPLUM_PORT`.

## Connect Managed Databases

Add the PostgreSQL and Redis databases as app resources. This allows DigitalOcean to manage trusted source access between the app and the databases.

Use the connection details from the DigitalOcean database dashboards for the environment variables below. If you enable certificate verification for PostgreSQL, download the database CA certificate and set `MEDPLUM_DATABASE_SSL_CA`.

## Environment Variables

Set these environment variables in the App Platform service:

```text
NODE_ENV=production
MEDPLUM_PORT=8080

MEDPLUM_BASE_URL=https://api.example.com/
MEDPLUM_APP_BASE_URL=https://app.example.com/
MEDPLUM_ISSUER=https://api.example.com/
MEDPLUM_JWKS_URL=https://api.example.com/.well-known/jwks.json
MEDPLUM_AUTHORIZE_URL=https://api.example.com/oauth2/authorize
MEDPLUM_TOKEN_URL=https://api.example.com/oauth2/token
MEDPLUM_USER_INFO_URL=https://api.example.com/oauth2/userinfo

MEDPLUM_DATABASE_HOST=your-postgres-host
MEDPLUM_DATABASE_PORT=25060
MEDPLUM_DATABASE_DBNAME=your-postgres-database
MEDPLUM_DATABASE_USERNAME=your-postgres-username
MEDPLUM_DATABASE_PASSWORD=your-postgres-password
MEDPLUM_DATABASE_RUN_MIGRATIONS=true
MEDPLUM_DATABASE_SSL_REQUIRE=true
MEDPLUM_DATABASE_SSL_REJECT_UNAUTHORIZED=true
MEDPLUM_DATABASE_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----

MEDPLUM_REDIS_HOST=your-redis-host
MEDPLUM_REDIS_PORT=your-redis-port
MEDPLUM_REDIS_PASSWORD=your-redis-password
MEDPLUM_REDIS_TLS={}

MEDPLUM_EMAIL_PROVIDER=none
MEDPLUM_SUPPORT_EMAIL=support@example.com
MEDPLUM_REGISTER_ENABLED=false
MEDPLUM_LOG_LEVEL=info
MEDPLUM_LOG_REQUESTS=true
MEDPLUM_LOG_AUDIT_EVENTS=true
MEDPLUM_SAVE_AUDIT_EVENTS=true
```

If you are not ready to configure SMTP, keep `MEDPLUM_EMAIL_PROVIDER=none`. To enable email, see the [SMTP configuration options](/docs/self-hosting/server-config).

## Deploy

Deploy the app and verify that the API server responds:

```bash
curl https://api.example.com/healthcheck
```

After the API server is running, deploy the Medplum web app separately and point it at the API server by setting `MEDPLUM_BASE_URL` before building the web app.

# Running the Full Medplum Stack in Docker

Medplum provides a Docker Compose file which comes with everything you need to get started in just two commands:

```bash
curl https://raw.githubusercontent.com/medplum/medplum/refs/heads/main/docker-compose.full-stack.yml > docker-compose.yml
docker compose up -d
```

The Docker Compose file includes the following containers:

- [valkey](https://hub.docker.com/r/valkey/valkey) (Redis-compatible cache and job queue)
- [postgres](https://hub.docker.com/_/postgres)
- [medplum/medplum-server](https://hub.docker.com/r/medplum/medplum-server)
- [medplum/medplum-app](https://hub.docker.com/r/medplum/medplum-app)

All the containers present are configured to work together out of the box with no configuration. Just run the commands above and go to http://localhost:3000 to get started with your own full-stack local instance of Medplum!

Medplum uses a Redis-compatible datastore for caching and background jobs. [Valkey](https://valkey.io/) is the recommended open-source implementation for self-hosted deployments. Redis and other compatible implementations may also be used. The Compose service is named `redis` and the server connects to it with the `MEDPLUM_REDIS_*` settings, which refer to the Redis protocol rather than a specific server. To use Redis instead, change the `image`, `command`, and `healthcheck` of that service.

Google reCAPTCHA is an optional integration for protecting public registration workflows. It is not required for Medplum authentication or self-hosted deployments. The default Compose file does not configure it. To enable it, see [Set up reCAPTCHA](/docs/user-management/custom-emails#setup-recaptcha) and set `MEDPLUM_RECAPTCHA_SITE_KEY` and `MEDPLUM_RECAPTCHA_SECRET_KEY` on the server and `RECAPTCHA_SITE_KEY` on the app.

:::info[]

Starting the whole stack can take a few minutes. This is due to the initial one-time setup Medplum server has to do before it is able to pass its healthcheck.

:::

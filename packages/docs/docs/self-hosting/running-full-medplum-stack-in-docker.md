# Running the Full Medplum Stack in Docker

Medplum provides a Docker Compose file which comes with everything you need to get started in just two commands:

```bash
curl https://raw.githubusercontent.com/medplum/medplum/refs/heads/main/docker-compose.full-stack.yml > docker-compose.yml
docker compose up -d
```

The Docker Compose file includes the following containers:

- [redis](https://hub.docker.com/_/redis)
- [postgres](https://hub.docker.com/_/postgres)
- [medplum/medplum-server](https://hub.docker.com/r/medplum/medplum-server)
- [medplum/medplum-app](https://hub.docker.com/r/medplum/medplum-app)

All the containers present are configured to work together out of the box with no configuration. Just run the commands above and go to http://localhost:3000 to get started with your own full-stack local instance of Medplum!

## Pointing the app image at your API server

The `medplum/medplum-app` image is a static nginx build. At container start, `packages/app/docker-entrypoint.sh` rewrites compiled assets with these environment variables:

| Name | Default in the image | Purpose |
| --- | --- | --- |
| `MEDPLUM_BASE_URL` | `http://localhost:8103/` | API server URL used by the browser |
| `MEDPLUM_CLIENT_ID` | empty | Optional Medplum client application ID |
| `GOOGLE_CLIENT_ID` | empty | Optional Google Auth client ID |
| `RECAPTCHA_SITE_KEY` | bundled demo key | Optional reCAPTCHA site key |
| `MEDPLUM_REGISTER_ENABLED` | `true` | Whether open registration is enabled |
| `MEDPLUM_AWS_TEXTRACT_ENABLED` | `true` | Whether AWS Textract is enabled |

If the app container is reached at a host other than `localhost`, or the server is not on port 8103, set `MEDPLUM_BASE_URL` to the URL the **browser** should call. That is often a public hostname, not the Docker Compose service name.

```yaml
medplum-app:
  image: medplum/medplum-app:latest
  environment:
    MEDPLUM_BASE_URL: 'https://api.example.com/'
```

These variables are substituted when the container starts. Changing them requires recreating the app container so the entrypoint can rewrite the files again.

:::info[]

Starting the whole stack can take a few minutes. This is due to the initial one-time setup Medplum server has to do before it is able to pass its healthcheck.

:::

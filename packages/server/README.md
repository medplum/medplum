# Medplum Server

## Prerequisites

- Node 16
- npm 7
- Postgres 12
- Redis 6

## Database

Create a "medplum" user:

```PLpgSQL
CREATE USER medplum WITH PASSWORD 'medplum';
```

Create a "medplum" database:

```PLpgSQL
CREATE DATABASE medplum;
GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
```

Create a "medplum_test" database:

```PLpgSQL
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
```

## Dev server:

```
npm run dev
```

## Production build

```
npm run build
```

## Docker

Medplum recommends Docker images for production deployment.

The `../scripts/deploy-server.sh` script does the following:

1. Creates a `.tar.gz` file with all files necessary to seed the Docker image
2. Runs `docker build` to build the Docker images
3. Runs `docker

#### Troubleshooting

Medplum uses the `buildx` command, which is currently an "experimental" Docker feature.

First, make sure that experimental features are enabled.

You may encounter the following error:

```
ERROR: multiple platforms feature is currently not supported for docker driver. Please switch to a different driver (eg. "docker buildx create --use")
```

If so, create a new multiarch driver:

```bash
docker buildx create --name multiarch --driver docker-container --use
```

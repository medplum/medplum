# Medplum Server

## Prerequisites

- Node.js 20+
- npm 10+
- Postgres 13+
- Redis 6+

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

## Running tests

Before running tests for the first time on a clean database, you first need to seed your test database with the required foundational resources, such as `StructureDefinition`s, `ValueSet`s, `SearchParameter`s, and the default admin account resources. To do this run the command:

```bash
npm run test:seed
```

After waiting for the seed test to complete, you can then run the rest of the server tests by running:

```bash
npm run test
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

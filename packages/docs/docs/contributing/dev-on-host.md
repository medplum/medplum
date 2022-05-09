---
sidebar_position: 20
---

# Dev on Host

Follow these instructions to get the complete Medplum stack running directly on your host machine.

## Prerequisites

1. **Install npm**: See [the npm documentation](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for instructions on installing it with your OS.
1. [Clone the Medplum repo](./clone-the-repo)

### Notes for Windows users

Running on Windows is supported, but it has a few extra steps:

- Redis does not support Windows, so considered using [Memurai](https://www.memurai.com/)
- Several build tools use bash scripts, so consider using [MSYS2](https://www.msys2.org/)

## Install

Our monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces), so installing dependencies for all projects is done using normal `npm install`:

```sh
cd medplum
npm ci
```

## Build

We provide convenience shell scripts to perform a full build and test:

```sh
./scripts/build.sh
```

This will do the following:

- Install npm dependencies if not already installed
- Build all packages
- Run all tests
- Run linter

## Run

### Background services

First, make sure that PostgreSQL and Redis are running.

#### Using Docker (Recommended)

Use the supplied `docker-compose-background.yml` file to run PostgreSQL and Redis background services. These services will be deployed with all necessary medplum configurations and database migrations.

From your root `medplum` directory run

```sh
docker-compose -f docker-compose-background.yml up
```

When `docker-compose` completes, you should see something like this in your terminal:

```bash
server_1    | INFO 2022-01-28T19:08:42.224Z Run database migrations
server_1    | INFO 2022-01-28T19:08:42.477Z No keys found.  Creating new key...
server_1    | INFO 2022-01-28T19:08:42.582Z Create user admin@example.com
server_1    | INFO 2022-01-28T19:08:42.639Z Created: 875bc82d-f5a3-49e3-bd36-c6aad1ba96cb
server_1    | INFO 2022-01-28T19:08:42.639Z Create project Medplum
server_1    | INFO 2022-01-28T19:08:42.650Z Created: 1bef07a1-b521-4130-9b33-884f90339ee8
server_1    | INFO 2022-01-28T19:08:42.651Z Create practitioner: Medplum Admin
server_1    | INFO 2022-01-28T19:08:42.671Z Created: 3cc2a03a-30c3-456f-9b3b-63c9b7b88caa
server_1    | INFO 2022-01-28T19:08:42.672Z Create project membership: Medplum
server_1    | INFO 2022-01-28T19:08:42.682Z Created: 93502aad-0b44-428d-b925-3b9b0fad5ad6
server_1    | INFO 2022-01-28T19:08:42.682Z Create default client Medplum
server_1    | INFO 2022-01-28T19:08:42.693Z Created: 301226d4-e139-408c-a61a-7bf06693515d
server_1    | INFO 2022-01-28T19:08:42.704Z Create Public project...
server_1    | INFO 2022-01-28T19:08:42.714Z Created: 52e4ac94-0f00-4f49-b1ed-469a8e8d78f2
```

This will seed the medplum database with an example project and user.
The email and password for the example user are:

- Email: admin@example.com
- Password: medplum_admin

#### Deploying manually

1. **Install PostgreSQL**: See [the PostgreSQL documentation](https://www.postgresql.org/download/) for instructions on installing it with your OS.
2. **Install Redis**: See [the Redis documentation](https://redis.io/download) for instructions on installing it with your OS.

### Start the servers

Start the API server:

```sh
cd packages/server
npm run dev
```

You can access the healthcheck at <http://localhost:5000/healthcheck>

### Develop the web UI

Start the web frontend:

```sh
cd packages/app
npm run dev
```

You can access the app at <http://localhost:3000/>

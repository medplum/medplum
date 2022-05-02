---
sidebar_position: 20
---

# Dev on Host

Follow these instructions to get the complete Medplum stack running directly on your host machine.

## Prerequisites

1. **Install PostgreSQL**: See [the PostgreSQL documentation](https://www.postgresql.org/download/) for instructions on installing it with your OS.
2. **Install Redis**: See [the Redis documentation](https://redis.io/download) for instructions on installing it with your OS.
3. **Install npm**: See [the npm documentation](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for instructions on installing it with your OS.
4. [Clone the Medplum repo](./clone-the-repo)

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

---
sidebar_position: 20
toc_max_heading_level: 4
---

# Run the Stack

Follow these instructions to get the complete Medplum stack running directly on your host machine.

<iframe width="560" height="315" src="https://www.youtube.com/embed/nf6OElRWOJ4" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## Prerequisites

1. **[Git](https://git-scm.com/)**
2. **[Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)** (version 18+ required, version 20+ recommended)
3. **[Docker](https://docs.docker.com/engine/install/)**
4. [Clone the Medplum repo](./local-dev-setup#clone-the-repo)

## Install

Our monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces), so installing dependencies for all projects is done using normal `npm install`:

```sh
cd medplum
npm ci
```

## Build

Use Turborepo to build all packages.

From your root medplum directory run:

```sh
npm run build:fast
```

## Background services

The Medplum Stack requires the following services to be running in your environment:

- [PostgreSQL](https://www.postgresql.org/) for the primary database
- [Redis](https://redis.com/) for caching and job queueing

When running these services on your local machine you can either use Docker (recommended) or install them directly onto your machine.

### Using Docker (Recommended)

Use the supplied `docker-compose.yml` file to run PostgreSQL and Redis background services. These services will be deployed with all necessary medplum configurations and database migrations.

From your root `medplum` directory run

```sh
docker-compose up
```

This will:

1. Start the PostgreSQL server in a container
2. Set up the appropriate configurations (see [postgres.conf](https://github.com/medplum/medplum/blob/main/postgres/postgres.conf))
3. Create two databases for testing: `medplum` and `medplum_test` (see [init_test.sql](https://github.com/medplum/medplum/blob/main/postgres/init_test.sql))

When `docker-compose` completes, you should see something like this in your terminal:

```bash
medplum-postgres-1  | PostgreSQL init process complete; ready for start up.
medplum-postgres-1  |
medplum-postgres-1  | 2022-07-29 00:37:44.639 GMT [1] LOG:  starting PostgreSQL 12.10 (Debian 12.10-1.pgdg110+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 10.2.1-6) 10.2.1 20210110, 64-bit
medplum-postgres-1  | 2022-07-29 00:37:44.639 GMT [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
medplum-postgres-1  | 2022-07-29 00:37:44.639 GMT [1] LOG:  listening on IPv6 address "::", port 5432
medplum-postgres-1  | 2022-07-29 00:37:44.642 GMT [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
medplum-postgres-1  | 2022-07-29 00:37:44.650 GMT [88] LOG:  database system was shut down at 2022-07-29 00:37:44 GMT
medplum-postgres-1  | 2022-07-29 00:37:44.654 GMT [1] LOG:  database system is ready to accept connections
```

**(Optional)** If you'd like to run a `psql` to shell to inspect the database, you can run

```sh
docker exec -it medplum-postgres-1 psql -U medplum
```

Where `medplum-postgres-1` can be replaced with the name of your postgres docker container.

### Deploying manually

If you'd prefer to install the dependencies directly, you can find installation instructions for the required services below:

1. [Install PostgreSQL](https://www.postgresql.org/download/)
2. [Install Redis](https://redis.io/download)

After that, you will have to update the file `packages/server/medplum.config.json`

```js
  "database": {
    "host": "",     // YOUR POSTGRESQL HOST
    "port": "",     // YOUR POSTGRESQL PORT
    "dbname": "",   // YOUR POSTGRESQL DB Name
    "username": "", // YOUR POSTGRESQL USERNAME
    "password": ""  // YOUR POSTGRESQL PASSWORD
  },
    "redis": {
    "host": "",     // YOUR REDIS HOST
    "port": "",     // YOUR REDIS PORT
    "password": "", // YOUR REDIS PASSWORD
  }
```

## Run tests (optional)

Use Turborepo to run all tests across all packages.

From your root medplum directory run:

```sh
npm t
```

## Run

### Start the servers

After you have PostgreSQL and Redis up and running, you can run the Medplum API server.

From your root `medplum` directory run:

```sh
cd packages/server
npm run dev
```

This will seed the medplum database with an example project and user.
The email and password for the example user are:

|              |                   |
| ------------ | ----------------- |
| **Email**    | admin@example.com |
| **Password** | medplum_admin     |

To make sure the server is working, you can access the health check at [http://localhost:8103/healthcheck](http://localhost:8103/healthcheck)

If everything is working, you should see the following in your browser:

```json
{ "ok": true, "version": "<MEDPLUM_VERSION>", "postgres": true, "redis": true }
```

:::warning Troubleshooting

If you get an error such as `error: role "medplum" does not exist` or `password authentication failed for user "medplum"` this usually means you have another instance of Postgres running. Closing the other instance should resolve this issue.

:::

### Run the Medplum Web App

Lastly, you can start the Medplum Wep App.

From your root `medplum` directory run:

```sh
cd packages/app
npm run dev
```

You can access the app at [http://localhost:3000/](http://localhost:3000/)

The default username is admin@example.com, default password medplum_admin.

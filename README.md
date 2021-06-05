# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![npm version](https://img.shields.io/npm/v/medplum.svg?color=blue)](https://www.npmjs.com/package/medplum) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum)

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

**Warning: This is Alpha code and not production ready.**

## Projects

Medplum uses a [monorepo](https://en.wikipedia.org/wiki/Monorepo) structure via [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).  All subprojects are in `packages`.

Here is a quick summary of the subprojects:

| Folder        | Description                            | Port  |
| ------------- | -------------------------------------- | ----- |
| `console`     | Developer console application          | 3000  |
| `core`        | Core Typescript client library         |       |
| `definitons`  | Data definitions                       |       |
| `generator`   | Code generator                         |       |
| `graphiql`    | GraphQL debug tool                     | 8080  |
| `server`      | Main server application                | 5000  |
| `ui`          | React component library and Storybook  | 6006  |

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

* Node 16
* npm 7
* Postgres 12

### Database

Create a "medplum" database and "medplum" user:

```PLpgSQL
CREATE DATABASE medplum;
CREATE USER medplum WITH PASSWORD 'medplum';
GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
\c medplum;
CREATE EXTENSION "uuid-ossp";
```

### Installing

Install and build:

```
./scripts/build.sh
```

Run the server:

```
npm run dev -w packages/server
```

Run the console:

```
npm run dev - packages/console
```

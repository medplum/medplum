# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![Maven Central](https://img.shields.io/maven-central/v/com.medplum/medplum-core.svg?color=blue)](https://www.npmjs.com/package/medplum) [![npm version](https://img.shields.io/npm/v/medplum.svg?color=blue)](https://www.npmjs.com/package/medplum) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum)

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

**Warning: This is Alpha code and not production ready.**

## Projects

Medplum uses a [monorepo](https://en.wikipedia.org/wiki/Monorepo) structure.

Medplum uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces) to manage subprojects.  All subprojects are located in the `packages` directory.

Here is a quick summary of the subprojects:

| Folder        | Type     | Port  | Description                            |
| ------------- | -------- | ----- | -------------------------------------- |
| `console`     | App      | 3000  | Developer console application          |
| `core`        | Library  |       | Core Typescript client library         |
| `definitons`  | Library  |       | Data definitions                       |
| `generator`   | App      |       | Code generator                         |
| `graphiql`    | App      | 8080  | GraphQL debug tool                     |
| `server`      | App      | 5000  | Main server application                |
| `ui`          | Library  | 6006  | React component library and Storybook  |

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

* Node 16
* npm 7
* Postgres 12

### Installing

Install and build:

```
./build.sh
```

Run the server:

```
npm run dev -w packages/server
```

Run the console:

```
npm run dev - packages/console
```

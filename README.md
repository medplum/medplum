# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![npm version](https://img.shields.io/npm/v/@medplum/core.svg?color=blue)](https://www.npmjs.com/package/medplum) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum)

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

## Projects

Medplum uses a [monorepo](https://en.wikipedia.org/wiki/Monorepo) structure via [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).  All subprojects are in `packages`.

Here is a quick summary of the subprojects:

| Folder                                 | Description                            | Port  |
| -------------------------------------- | -------------------------------------- | ----- |
| [`app`](packages/app)                  | End user application                   | 3000  |
| [`core`](packages/core)                | Core Typescript client library         |       |
| [`definitions`](packages/definiitons)  | Data definitions                       |       |
| [`generator`](packages/generator)      | Code generator                         |       |
| [`graphiql`](packages/graphiql)        | GraphQL debug tool                     | 8080  |
| [`seeder`](packages/seeder)            | Seeder application                     |       |
| [`server`](packages/server)            | Main server application                | 5000  |
| [`ui`](packages/ui)                    | React component library and Storybook  | 6006  |

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

* Node 16
* npm 7
* Postgres 12

### Database

Create a "medplum" user:

```PLpgSQL
CREATE USER medplum WITH PASSWORD 'medplum';
```

Create a "medplum" database:

```PLpgSQL
CREATE DATABASE medplum;
GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
\c medplum;
CREATE EXTENSION "uuid-ossp";
```

Create a "medplum_test" database:

```PLpgSQL
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
\c medplum_test;
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

Run the app:

```
npm run dev -w packages/app
```

## License

[Apache 2.0](LICENSE.txt)

Copyright &copy; Medplum 2021

FHIR &reg; is a registered trademark of HL7.

SNOMED &reg; is a registered trademark of the International Health Terminology Standards Development Organisation.

DICOM &reg; is the registered trademark of the National Electrical Manufacturers Association (NEMA).

# Medplum Server

## Prerequisites

* Node 16
* npm 7
* Postgres 12

## Database

Create a "medplum" database and "medplum" user:

```PLpgSQL
CREATE DATABASE medplum;
CREATE USER medplum WITH PASSWORD 'medplum';
GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
\c medplum;
CREATE EXTENSION "uuid-ossp";
```

## Dev server:

```
npm run dev
```

## Production build

```
npm run build
```

# Medplum Server

## Prerequisites

* Node 16
* npm 7
* Postgres 12
* Redis 6

## Database

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

## Dev server:

```
npm run dev
```

## Production build

```
npm run build
```

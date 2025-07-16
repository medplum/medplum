---
sidebar_position: 90
---

# Upgrading Medplum Server

Upgrading to newer versions of Medplum server is a crucial step of staying compliant and getting
the benefits of security patches, new features, and performance improvements. As discussed in
Medplum's [versioning policy](/docs/compliance/versions), Medplum uses semantic versioning. Starting in
Medplum v3.3.0, to deploy a new major (X.0.0) or minor (X.Y.0) version, all previous versions' database
migrations must have already been completed before being able to deploy the newer version of Medplum server.

Medplum server automatically attempts to apply all new database migrations after starting up by default.
To upgrade to a newer version of Medplum server, the newest patch version of every intermediate minor version
must first be deployed and allowed to complete all database migrations successfully before moving on to the next
minor version. **Attempting to jump ahead and skip a minor version will result in the new version of Medplum server refusing to start.**

For example, the steps for upgrading from Medplum v3.1.2 to Medplum v4.3.4 are as follows:

- Deploy the latest v3.3.X patch version, e.g. v3.3.0, and allow all database migrations to complete
- Update your application code to account for the breaking changes in Medplum v4 since major versions are not backward compatible.
- Deploy the latest v4.0.X patch version, e.g. v4.0.4, and allow all database migrations to complete
- Deploy the latest v4.1.X patch version, e.g. v4.1.12, and allow all database migrations to complete
- Deploy the latest v4.2.X patch version, e.g. v4.2.6, and allow all database migrations to complete
- Deploy the latest v4.3.X patch version, e.g. v4.3.4, and allow all database migrations to complete

## Database migrations

Starting in v4.0.0, Medplum has the concepts of "pre-deploy" and "post-deploy" migrations.

### Pre-deploy migrations

- Pending pre-deploy migrations run automatically during server startup. **If a pre-deploy migration fails, the server will not start.**
- Must complete quickly (within seconds) regardless of dataset size. This prevents migrations from causing servers to violate their startup availability grace period, typically in the range of single digit minutes, even if many pending pre-deploy migrations have accumulated.
- Effects of pre-deploy migrations are relied upon immediately by server code in the same deployment.
- Typically consist adding or altering columns, new tables, etc.

### Post-deploy migrations

- Deferred until after server startup
- Can take anywhere from seconds to hours or days to complete depending on dataset size
- Migrations can have a `requiredBefore` version specified in a [manifest file](https://github.com/medplum/medplum/blob/main/packages/server/src/migrations/data/data-version-manifest.json). The field is initially blank and is set in next minor version release.
- Medplum server cannot assume a post-deploy migration has been executed prior to its `requiredBefore` version.
- Includes:
  - Concurrently adding indexes
  - Partial or full reindexing of FHIR resources to support new search parameters, performance improvements, etc.
  - Data backfilling/transformation
  - Other schema or data operations that can take longer than a few seconds or must be deferred until after all pre-deploy migrations have completed

Each post-deploy migration has an associated `AsyncJob` resource that is used internally to track the progress of the migration with `AsyncJob.type` set to `data-migration` and `AsyncJob.dataVersion` set to the migration number. The `AsyncJob` resource can be used to monitor the progress of the migration and to determine when it has completed.

Starting in Medplum v4.1.2, an [AsyncJob super admin control panel](https://github.com/medplum/medplum/pull/6862) is available in the `@medplum/app` web app at the path `/admin/super/asyncjob` to facilitate the management of post-deploy migrations.

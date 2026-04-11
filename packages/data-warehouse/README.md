# @medplum/data-warehouse

Medplum Data Warehouse Export Tool. This package provides a scheduled job designed to incrementally export data from a Postgres database to Apache Iceberg tables in S3 using DuckDB.

## Features

- Uses DuckDB's in-process engine for fast, memory-efficient data extraction.
- Exports Postgres `AuditEvent` data to Apache Iceberg tables directly on S3.
- Designed to run as an external scheduled job (e.g., Kubernetes CronJob).
- Idempotent export using explicit time windows (`[startWindow, endWindow)`).

## Usage

You can run the tool via its CLI.

To export to unmanaged Parquet files (Iceberg-compatible, but does not require AWS):

```bash
npx @medplum/data-warehouse export \
  --s3-bucket my-iceberg-bucket \
  --s3-region us-east-1 \
  --start-window "2026-04-11T10:00:00Z" \
  --end-window "2026-04-11T10:15:00Z"
```

To export natively to AWS S3 Tables (fully managed Iceberg tables, requires AWS):

```bash
npx @medplum/data-warehouse export \
  --aws-s3-table-arn arn:aws:s3tables:us-east-1:99999999:bucket/my-s3-tables-bucket \
  --s3-region us-east-1 \
  --start-window "2026-04-11T10:00:00Z" \
  --end-window "2026-04-11T10:15:00Z"
```

### Environment Variables

Alternatively, you can provide configuration via environment variables (or a `.env` file):

- `MEDPLUM_DATABASE_URL`: Postgres Database URL (if set, overrides individual fields below).
- `MEDPLUM_DATABASE_HOST`: Postgres Database Host.
- `MEDPLUM_DATABASE_PORT`: Postgres Database Port (defaults to `5432`).
- `MEDPLUM_DATABASE_DBNAME`: Postgres Database Name.
- `MEDPLUM_DATABASE_USERNAME`: Postgres Database Username.
- `MEDPLUM_DATABASE_PASSWORD`: Postgres Database Password.
- `S3_BUCKET`: AWS S3 bucket name (use if not using AWS S3 Tables).
- `AWS_S3_TABLE_ARN`: AWS S3 Table ARN (use if using managed AWS S3 Tables).

## Docker

A standalone `Dockerfile` is included. It uses `node:24-alpine` to provide a lightweight execution environment.

```bash
docker build -t medplum-data-warehouse -f packages/data-warehouse/Dockerfile .
docker run --env-file .env medplum-data-warehouse export \
  --start-window "2026-04-11T10:00:00Z" \
  --end-window "2026-04-11T10:15:00Z"
```

## Testing

The tool uses `@testcontainers/postgresql` to spin up a transient Postgres database and mocks S3 operations by writing Iceberg tables to a local temporary directory using DuckDB's native capabilities.

```bash
npm run test
```

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getResourceTypes } from '@medplum/core';
import type { MedplumDatabaseConfig, MedplumDatabaseSslConfig } from '../config/types';

/** Default Postgres `statement_timeout` applied to DuckDB-attached connections (milliseconds). */
export const DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT = 60_000 * 5; // 5 minutes

/**
 * Appends libpq-compatible SSL query parameters for DuckDB `ATTACH (TYPE postgres)`.
 *
 * @param params - URI search params to append to.
 * @param ssl - Medplum database SSL settings.
 */
export function appendMedplumDatabaseSslSearchParams(params: URLSearchParams, ssl?: MedplumDatabaseSslConfig): void {
  if (!ssl) {
    return;
  }

  if (ssl.cert) {
    params.set('sslcert', ssl.cert);
  }
  if (ssl.key) {
    params.set('sslkey', ssl.key);
  }

  if (ssl.rejectUnauthorized === true && ssl.ca) {
    params.set('sslmode', 'verify-full');
    params.set('sslrootcert', ssl.ca);
  } else if (ssl.require || ssl.rejectUnauthorized === false) {
    params.set('sslmode', 'require');
  }
}

/**
 * Builds a PostgreSQL URI for DuckDB `ATTACH (TYPE postgres)` from {@link MedplumDatabaseConfig},
 * including `options=-c statement_timeout=...` and TLS via `sslmode` / cert paths from {@link MedplumDatabaseConfig.ssl}.
 *
 * @param db - Medplum database settings; host, dbname, username, and password must be set.
 * @returns A PostgreSQL connection URI (`postgresql://...`).
 * @see https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING-URIS
 */
export function buildPgConnectionURI(db: MedplumDatabaseConfig): string {
  const host = db.host;
  const dbname = db.dbname;
  const username = db.username;
  const password = db.password;
  const port = db.port;

  if (!host || !dbname || !username || !password) {
    throw new Error('Missing required database configuration: host, dbname, username, and password are required.');
  }

  // Userinfo is pre-encoded so `@` in usernames does not terminate the authority section.
  const url = new URL(`postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@localhost/`);
  url.hostname = host;
  if (port !== undefined) {
    url.port = String(port);
  }
  url.pathname = `/${dbname}`;

  const timeout = db.queryTimeout ?? DEFAULT_DW_DATABASE_STATEMENT_TIMEOUT;
  const searchParams = new URLSearchParams();
  searchParams.set('options', '-c statement_timeout=' + String(timeout));
  appendMedplumDatabaseSslSearchParams(searchParams, db.ssl);
  // libpq / DuckDB postgres attach do not treat '+' as space in query values; use encodeURIComponent.
  url.search = Array.from(searchParams.entries())
    .map(([key, value]) => key + '=' + encodeURIComponent(value))
    .join('&');

  return url.toString();
}

/**
 * One Postgres source and its managed Iceberg table name.
 * `postgresTable` is used verbatim in SQL; `icebergTable` is used for S3 Tables / DuckDB paths.
 */
export interface WarehouseSourceTable {
  /** PostgreSQL table identifier as stored (double-quoted in SQL). */
  readonly postgresTable: string;
  /** Managed Iceberg / S3 Tables name: result of `toIcebergTableName(postgresTable)`. */
  readonly icebergTable: string;
}

/**
 * Postgres history table names for all indexed repository resource types (`{ResourceType}_History`),
 * matching migrations (`resourceType + '_History'`).
 * Used by the scheduled data warehouse sync worker.
 *
 * @returns The list of Postgres table names.
 */
export function getWarehouseSyncPostgresTableNames(): string[] {
  return getResourceTypes().map((resourceType) => `${resourceType}_History`);
}

/**
 * Normalize a Postgres table identifier to the managed Iceberg / Parquet path segment by lowercasing only.
 *
 * @param tableIdentifier - Postgres `relname`-style identifier (e.g. `AuditEvent_History`).
 * @returns Lowercased name (e.g. `auditevent_history`).
 */
export function toIcebergTableName(tableIdentifier: string): string {
  return tableIdentifier.toLowerCase();
}

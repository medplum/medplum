// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SqlDialect as SqlDialectType } from '../sql/dialect.js';
import { SqlDialect } from '../sql/dialect.js';

/**
 * Converts a resource row from the indexing layer into dialect-specific storage values.
 * @param row - The resource row object to serialize.
 * @param dialect - The SQL dialect to serialize for.
 * @returns A dialect-specific serialized row.
 */
export function serializeRowForDialect(row: Record<string, any>, dialect: SqlDialectType): Record<string, any> {
  if (dialect === SqlDialect.POSTGRES) {
    return row;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) {
      continue;
    }
    result[key] = serializeValueForDialect(value);
  }
  return result;
}

function serializeValueForDialect(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && isPostgresRange(value)) {
    return JSON.stringify(parsePostgresRange(value));
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function isPostgresRange(value: string): boolean {
  return value.startsWith('[') || value.startsWith('(');
}

function parsePostgresRange(value: string): { start?: string | number; end?: string | number } {
  const trimmed = value.slice(1, -1);
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex < 0) {
    return {};
  }
  const start = trimmed.slice(0, commaIndex).trim();
  const end = trimmed.slice(commaIndex + 1).trim();
  return {
    start: start || undefined,
    end: end || undefined,
  };
}

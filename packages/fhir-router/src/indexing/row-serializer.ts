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
    if (value === null) {
      result[key] = null;
      continue;
    }
    if (typeof value === 'boolean') {
      result[key] = value ? 1 : 0;
      continue;
    }
    if (typeof value === 'number') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = JSON.stringify(value);
      continue;
    }
    if (typeof value === 'string' && isPostgresRange(value)) {
      result[key] = JSON.stringify(parsePostgresRange(value));
      continue;
    }
    if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
      continue;
    }
    result[key] = value;
  }
  return result;
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

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SqlFunctionDefinition } from '../fhir/sql';

export interface SchemaDefinition {
  tables: TableDefinition[];
  functions: SqlFunctionDefinition[];
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  compositePrimaryKey?: string[];
  indexes: IndexDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  notNull?: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
}

export const IndexTypes = ['btree', 'gin', 'gist'] as const;
export type IndexType = (typeof IndexTypes)[number];

export type IndexColumn = {
  expression: string;
  name: string;
};

export interface IndexDefinition {
  columns: (string | IndexColumn)[];
  indexType: IndexType;
  unique?: boolean;
  include?: string[];
  where?: string;
  indexNameSuffix?: string;
  indexdef?: string;
}

export type MigrationAction =
  | { type: 'CREATE_FUNCTION'; name: string; createQuery: string }
  | { type: 'CREATE_TABLE'; definition: TableDefinition }
  | { type: 'DROP_TABLE'; tableName: string }
  | { type: 'ADD_COLUMN'; tableName: string; columnDefinition: ColumnDefinition }
  | { type: 'DROP_COLUMN'; tableName: string; columnName: string }
  | { type: 'ALTER_COLUMN_SET_DEFAULT'; tableName: string; columnName: string; defaultValue: string }
  | { type: 'ALTER_COLUMN_DROP_DEFAULT'; tableName: string; columnName: string }
  | { type: 'ALTER_COLUMN_UPDATE_NOT_NULL'; tableName: string; columnName: string; notNull: boolean }
  | { type: 'ALTER_COLUMN_TYPE'; tableName: string; columnName: string; columnType: string }
  | { type: 'CREATE_INDEX'; indexName: string; createIndexSql: string }
  | { type: 'DROP_INDEX'; indexName: string }
  | { type: 'ANALYZE_TABLE'; tableName: string };

export type MigrationActionResult = { name: string; durationMs: number };

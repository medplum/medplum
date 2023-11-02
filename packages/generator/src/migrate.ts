import {
  getAllDataTypes,
  getSearchParameterDetails,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  InternalTypeSchema,
  isResourceTypeSchema,
  PropertyType,
  SearchParameterDetails,
  SearchParameterType,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { FileBuilder } from './filebuilder';

interface SchemaDefinition {
  tables: TableDefinition[];
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
}

interface ColumnDefinition {
  name: string;
  type: string;
}

type IndexType = 'btree' | 'gin';

interface IndexDefinition {
  columns: string[];
  indexType: IndexType;
  unique?: boolean;
}

const searchParams: SearchParameter[] = [];

export async function main(): Promise<void> {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  const searchParamBundle = readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>;
  indexSearchParameterBundle(searchParamBundle);

  const medplumSearchParamBundle = readJson('fhir/r4/search-parameters-medplum.json') as Bundle<SearchParameter>;
  indexSearchParameterBundle(medplumSearchParamBundle);

  for (const entry of searchParamBundle.entry as BundleEntry<SearchParameter>[]) {
    if (entry.resource) {
      searchParams.push(entry.resource);
    }
  }

  for (const entry of medplumSearchParamBundle.entry as BundleEntry<SearchParameter>[]) {
    if (entry.resource) {
      searchParams.push(entry.resource);
    }
  }

  const startDefinition = await buildStartDefinition();
  const targetDefinition = buildTargetDefinition();
  const b = new FileBuilder();
  writeMigrations(b, startDefinition, targetDefinition);
  writeFileSync(resolve(__dirname, '../../server/src/migrations/schema/v52.ts'), b.toString(), 'utf8');
}

async function buildStartDefinition(): Promise<SchemaDefinition> {
  const db = new Client({
    host: 'localhost',
    port: 5432,
    database: 'medplum',
    user: 'medplum',
    password: 'medplum',
  });

  await db.connect();

  const tableNames = await getTableNames(db);
  const tables: TableDefinition[] = [];

  for (const tableName of tableNames) {
    tables.push(await getTableDefinition(db, tableName));
  }

  await db.end();
  return { tables };
}

async function getTableNames(db: Client): Promise<string[]> {
  const rs = await db.query("SELECT * FROM information_schema.tables WHERE table_schema='public'");
  return rs.rows.map((row) => row.table_name);
}

async function getTableDefinition(db: Client, name: string): Promise<TableDefinition> {
  return {
    name,
    columns: await getColumns(db, name),
    indexes: await getIndexes(db, name),
  };
}

async function getColumns(db: Client, tableName: string): Promise<ColumnDefinition[]> {
  const rs = await db.query(`
    SELECT
      attname,
      attnotnull,
      format_type(atttypid, atttypmod) AS data_type
    FROM
      pg_attribute
      JOIN pg_class ON pg_class.oid = attrelid
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE
      pg_namespace.nspname = 'public'
      AND pg_class.relname = '${tableName}'
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY
      attnum
  `);

  return rs.rows.map((row) => ({
    name: row.attname,
    type: row.data_type.toUpperCase() + (row.attnotnull ? ' NOT NULL' : ''),
  }));
}

async function getIndexes(db: Client, tableName: string): Promise<IndexDefinition[]> {
  const rs = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${tableName}'`);
  return rs.rows.map((row) => parseIndexDefinition(row.indexdef));
}

function parseIndexDefinition(indexdef: string): IndexDefinition {
  // Use a regex to get the column names inside the parentheses
  const matches = indexdef.match(/\(([^)]+)\)/);
  if (!matches) {
    throw new Error('Invalid index definition: ' + indexdef);
  }

  return {
    columns: matches[1].split(',').map((s) => s.trim().replaceAll('"', '')),
    indexType: indexdef.includes('USING gin') ? 'gin' : 'btree',
    unique: indexdef.includes('CREATE UNIQUE INDEX'),
  };
}

function buildTargetDefinition(): SchemaDefinition {
  const result: SchemaDefinition = { tables: [] };

  for (const [resourceType, typeSchema] of Object.entries(getAllDataTypes())) {
    buildCreateTables(result, resourceType, typeSchema);
  }

  buildAddressTable(result);
  buildContactPointTable(result);
  buildIdentifierTable(result);
  buildHumanNameTable(result);
  buildValueSetElementTable(result);

  return result;
}

function buildCreateTables(result: SchemaDefinition, resourceType: string, fhirType: InternalTypeSchema): void {
  if (!isResourceTypeSchema(fhirType)) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }

  const tableDefinition: TableDefinition = {
    name: resourceType,
    columns: [
      { name: 'id', type: 'UUID NOT NULL PRIMARY KEY' },
      { name: 'content', type: 'TEXT NOT NULL' },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ NOT NULL' },
      { name: 'deleted', type: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'compartments', type: 'UUID[] NOT NULL' },
      { name: '_source', type: 'TEXT' },
      { name: '_tag', type: 'TEXT[]' },
      { name: '_profile', type: 'TEXT[]' },
    ],
    indexes: [
      { columns: ['lastUpdated'], indexType: 'btree' },
      { columns: ['compartments'], indexType: 'gin' },
      { columns: ['_source'], indexType: 'btree' },
      { columns: ['_tag'], indexType: 'gin' },
      { columns: ['_profile'], indexType: 'gin' },
    ],
  };

  buildSearchColumns(tableDefinition, resourceType);
  buildSearchIndexes(tableDefinition, resourceType);
  result.tables.push(tableDefinition);

  result.tables.push({
    name: resourceType + '_History',
    columns: [
      { name: 'versionId', type: 'UUID NOT NULL PRIMARY KEY' },
      { name: 'id', type: 'UUID NOT NULL' },
      { name: 'content', type: 'TEXT NOT NULL' },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ NOT NULL' },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree' },
      { columns: ['lastUpdated'], indexType: 'btree' },
    ],
  });

  result.tables.push({
    name: resourceType + '_Token',
    columns: [
      { name: 'resourceId', type: 'UUID NOT NULL' },
      { name: 'index', type: 'INTEGER NOT NULL' },
      { name: 'code', type: 'TEXT NOT NULL' },
      { name: 'system', type: 'TEXT' },
      { name: 'value', type: 'TEXT' },
    ],
    indexes: [
      { columns: ['resourceId'], indexType: 'btree' },
      { columns: ['code'], indexType: 'btree' },
      { columns: ['system'], indexType: 'btree' },
      { columns: ['value'], indexType: 'btree' },
    ],
  });
}

function buildSearchColumns(tableDefinition: TableDefinition, resourceType: string): void {
  for (const searchParam of searchParams) {
    if (!searchParam.base?.includes(resourceType as ResourceType)) {
      continue;
    }

    const details = getSearchParameterDetails(resourceType, searchParam);
    if (isLookupTableParam(searchParam, details)) {
      continue;
    }

    const columnName = details.columnName;
    tableDefinition.columns.push({ name: columnName, type: getColumnType(details) });
    tableDefinition.indexes.push({ columns: [columnName], indexType: details.array ? 'gin' : 'btree' });
  }
}

function isLookupTableParam(searchParam: SearchParameter, details: SearchParameterDetails): boolean {
  // Identifier
  if (searchParam.code === 'identifier' && searchParam.type === 'token') {
    return true;
  }

  // HumanName
  const nameParams = [
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name',
  ];
  if (nameParams.includes(searchParam.id as string)) {
    return true;
  }

  // Telecom
  const telecomParams = [
    'individual-telecom',
    'individual-email',
    'individual-phone',
    'OrganizationAffiliation-telecom',
    'OrganizationAffiliation-email',
    'OrganizationAffiliation-phone',
  ];
  if (telecomParams.includes(searchParam.id as string)) {
    return true;
  }

  // Address
  const addressParams = ['individual-address', 'InsurancePlan-address', 'Location-address', 'Organization-address'];
  if (addressParams.includes(searchParam.id as string)) {
    return true;
  }

  // "address-"
  if (searchParam.code?.startsWith('address-')) {
    return true;
  }

  // Token
  if (searchParam.type === 'token') {
    if (searchParam.code?.endsWith(':identifier')) {
      return true;
    }

    for (const elementDefinition of details.elementDefinitions ?? []) {
      // Check for any "Identifier", "CodeableConcept", or "Coding"
      // Any of those value types require the "Token" table for full system|value search semantics.
      // The common case is that the "type" property only has one value,
      // but we need to support arrays of types for the choice-of-type properties such as "value[x]".
      for (const type of elementDefinition.type ?? []) {
        if (
          type.code === PropertyType.Identifier ||
          type.code === PropertyType.CodeableConcept ||
          type.code === PropertyType.Coding ||
          type.code === PropertyType.ContactPoint
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function getColumnType(details: SearchParameterDetails): string {
  let baseColumnType: string;
  switch (details.type) {
    case SearchParameterType.BOOLEAN:
      baseColumnType = 'BOOLEAN';
      break;
    case SearchParameterType.DATE:
      baseColumnType = 'DATE';
      break;
    case SearchParameterType.DATETIME:
      baseColumnType = 'TIMESTAMPTZ';
      break;
    case SearchParameterType.NUMBER:
    case SearchParameterType.QUANTITY:
      if (details.columnName === 'priorityOrder') {
        baseColumnType = 'INTEGER';
      } else {
        baseColumnType = 'DOUBLE PRECISION';
      }
      break;
    default:
      baseColumnType = 'TEXT';
      break;
  }

  return details.array ? baseColumnType + '[]' : baseColumnType;
}

function buildSearchIndexes(result: TableDefinition, resourceType: string): void {
  if (resourceType === 'User') {
    result.indexes.push({ columns: ['email'], indexType: 'btree', unique: true });
  }
}

function buildAddressTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'Address', ['address', 'city', 'country', 'postalCode', 'state', 'use']);
}

function buildContactPointTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'ContactPoint', ['system', 'value']);
}

function buildIdentifierTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'Identifier', ['system', 'value']);
}

function buildHumanNameTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'HumanName', ['name', 'given', 'family']);
}

function buildLookupTable(result: SchemaDefinition, tableName: string, columns: string[]): void {
  const tableDefinition: TableDefinition = {
    name: tableName,
    columns: [
      { name: 'id', type: 'UUID NOT NULL PRIMARY KEY' },
      { name: 'resourceId', type: 'UUID NOT NULL' },
      { name: 'index', type: 'INTEGER NOT NULL' },
      { name: 'content', type: 'TEXT NOT NULL' },
    ],
    indexes: [],
  };

  for (const column of columns) {
    tableDefinition.columns.push({ name: column, type: 'TEXT' });
    tableDefinition.indexes.push({ columns: [column], indexType: 'btree' });
  }

  result.tables.push(tableDefinition);
}

function buildValueSetElementTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'ValueSetElement',
    columns: [
      { name: 'id', type: 'UUID NOT NULL PRIMARY KEY' },
      { name: 'system', type: 'TEXT' },
      { name: 'code', type: 'TEXT' },
      { name: 'display', type: 'TEXT' },
    ],
    indexes: [
      { columns: ['system'], indexType: 'btree' },
      { columns: ['code'], indexType: 'btree' },
      { columns: ['display'], indexType: 'btree' },
    ],
  });
}

function writeMigrations(b: FileBuilder, startDefinition: SchemaDefinition, targetDefinition: SchemaDefinition): void {
  b.append("import { PoolClient } from 'pg';");
  b.newLine();
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;

  for (const targetTable of targetDefinition.tables) {
    const startTable = startDefinition.tables.find((t) => t.name === targetTable.name);
    migrateTable(b, startTable, targetTable);
  }

  b.indentCount--;
  b.append('}');
}

function migrateTable(b: FileBuilder, startTable: TableDefinition | undefined, targetTable: TableDefinition): void {
  if (!startTable) {
    writeCreateTable(b, targetTable);
  } else {
    migrateColumns(b, startTable, targetTable);
    migrateIndexes(b, startTable, targetTable);
  }
}

function writeCreateTable(b: FileBuilder, tableDefinition: TableDefinition): void {
  b.newLine();
  b.appendNoWrap(`await client.query(\`CREATE TABLE IF NOT EXISTS "${tableDefinition.name}" (`);
  b.indentCount++;
  for (let i = 0; i < tableDefinition.columns.length; i++) {
    b.append(
      `"${tableDefinition.columns[i].name}" ${tableDefinition.columns[i].type}` +
        (i !== tableDefinition.columns.length - 1 ? ',' : '')
    );
  }
  b.indentCount--;
  b.append('`);');
  b.newLine();

  for (const indexDefinition of tableDefinition.indexes) {
    b.appendNoWrap(`await client.query('${buildIndexSql(tableDefinition.name, indexDefinition)}');`);
  }
  b.newLine();
}

function migrateColumns(b: FileBuilder, startTable: TableDefinition, targetTable: TableDefinition): void {
  for (const targetColumn of targetTable.columns) {
    const startColumn = startTable.columns.find((c) => c.name === targetColumn.name);
    if (!startColumn) {
      writeAddColumn(b, targetTable, targetColumn);
    } else if (normalizeColumnType(startColumn) !== normalizeColumnType(targetColumn)) {
      writeUpdateColumn(b, targetTable, targetColumn);
    }
  }
}

function normalizeColumnType(column: ColumnDefinition): string {
  return column.type
    .replaceAll('TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ')
    .replaceAll(' PRIMARY KEY', '')
    .replaceAll(' DEFAULT FALSE', '')
    .trim();
}

function writeAddColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE "${tableDefinition.name}" ADD COLUMN IF NOT EXISTS "${columnDefinition.name}" ${columnDefinition.type}');`
  );
}

function writeUpdateColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE "${tableDefinition.name}" ALTER COLUMN "${columnDefinition.name}" TYPE ${columnDefinition.type}');`
  );
}

function migrateIndexes(b: FileBuilder, startTable: TableDefinition, targetTable: TableDefinition): void {
  for (const targetIndex of targetTable.indexes) {
    const startIndex = startTable.indexes.find((i) => i.columns.join(',') === targetIndex.columns.join(','));
    if (!startIndex) {
      writeAddIndex(b, targetTable, targetIndex);
    }
  }
}

function writeAddIndex(b: FileBuilder, tableDefinition: TableDefinition, indexDefinition: IndexDefinition): void {
  b.appendNoWrap(`await client.query('${buildIndexSql(tableDefinition.name, indexDefinition)}');`);
}

function buildIndexSql(tableName: string, index: IndexDefinition): string {
  let result = 'CREATE ';

  if (index.unique) {
    result += 'UNIQUE ';
  }

  result += 'INDEX CONCURRENTLY IF NOT EXISTS ';
  result += tableName;
  result += '_';
  result += index.columns.join('_');
  result += '_idx ON "';
  result += tableName;
  result += '" ';

  if (index.indexType === 'gin') {
    result += 'USING gin ';
  }

  result += '(';
  result += index.columns.map((c) => `"${c}"`).join(', ');
  result += ')';
  return result;
}

if (process.argv[1].endsWith('migrate.ts')) {
  main().catch(console.error);
}

import {
  deepEquals,
  FileBuilder,
  getAllDataTypes,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  InternalTypeSchema,
  isPopulated,
  isResourceTypeSchema,
  SearchParameterType,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { getSearchParameterImplementation, SearchParameterImplementation } from '../fhir/searchparameter';

const SCHEMA_DIR = resolve(__dirname, 'schema');
let LOG_UNMATCHED_INDEXES = false;
let DRY_RUN = false;

interface SchemaDefinition {
  tables: TableDefinition[];
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  compositePrimaryKey?: string[];
  indexes: IndexDefinition[];
}

interface ColumnDefinition {
  name: string;
  type: string;
}

const IndexTypes = ['btree', 'gin', 'gist'] as const;
type IndexType = (typeof IndexTypes)[number];

interface IndexDefinition {
  columns: string[];
  indexType: IndexType;
  unique?: boolean;
}

const searchParams: SearchParameter[] = [];

export async function main(): Promise<void> {
  LOG_UNMATCHED_INDEXES = process.argv.includes('--logUnmatchedIndexes');
  DRY_RUN = process.argv.includes('--dryRun');

  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    const bundle = readJson(filename) as Bundle<SearchParameter>;
    indexSearchParameterBundle(bundle);

    if (!isPopulated(bundle.entry)) {
      throw new Error('Empty search parameter bundle: ' + filename);
    }
    for (const entry of bundle.entry) {
      if (entry.resource) {
        searchParams.push(entry.resource);
      }
    }
  }

  const startDefinition = await buildStartDefinition();
  const targetDefinition = buildTargetDefinition();
  const b = new FileBuilder();
  writeMigrations(b, startDefinition, targetDefinition);
  if (DRY_RUN) {
    console.log(b.toString());
  } else {
    writeFileSync(`${SCHEMA_DIR}/v${getNextSchemaVersion()}.ts`, b.toString(), 'utf8');
    rewriteMigrationExports();
  }
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
  const matches = indexdef.match(/\((.+)\)$/);
  if (!matches) {
    throw new Error('Invalid index definition: ' + indexdef);
  }

  const indexType = indexdef.match(/USING (\w+)/)?.[1] as IndexType | undefined;
  if (indexType && !IndexTypes.includes(indexType)) {
    throw new Error('Invalid index type: ' + indexType);
  }

  return {
    columns: matches[1].split(',').map((s) => s.trim().replaceAll('"', '')),
    indexType: indexType ?? 'btree',
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
      { name: 'projectId', type: 'UUID' },
      { name: '_source', type: 'TEXT' },
      { name: '_tag', type: 'TEXT[]' },
      { name: '_profile', type: 'TEXT[]' },
      { name: '_security', type: 'TEXT[]' },
    ],
    indexes: [
      { columns: ['lastUpdated'], indexType: 'btree' },
      { columns: ['compartments'], indexType: 'gin' },
      { columns: ['projectId'], indexType: 'btree' },
      { columns: ['_source'], indexType: 'btree' },
      { columns: ['_tag'], indexType: 'gin' },
      { columns: ['_profile'], indexType: 'gin' },
      { columns: ['_security'], indexType: 'gin' },
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
      { name: 'code', type: 'TEXT NOT NULL' },
      { name: 'system', type: 'TEXT' },
      { name: 'value', type: 'TEXT' },
    ],
    indexes: [
      { columns: ['resourceId'], indexType: 'btree' },
      // TODO: Add composite indexes and support for `include`
    ],
  });

  result.tables.push({
    name: resourceType + '_References',
    columns: [
      { name: 'resourceId', type: 'UUID NOT NULL' },
      { name: 'targetId', type: 'UUID NOT NULL' },
      { name: 'code', type: 'TEXT NOT NULL' },
    ],
    compositePrimaryKey: ['resourceId', 'targetId', 'code'],
    indexes: [],
  });
}

function buildSearchColumns(tableDefinition: TableDefinition, resourceType: string): void {
  for (const searchParam of searchParams) {
    if (searchParam.type === 'composite') {
      continue;
    }

    if (!searchParam.base?.includes(resourceType as ResourceType)) {
      continue;
    }

    const impl = getSearchParameterImplementation(resourceType, searchParam);
    if (impl.searchStrategy === 'lookup-table') {
      continue;
    }

    const columnName = impl.columnName;
    tableDefinition.columns.push({ name: columnName, type: getColumnType(impl) });
    tableDefinition.indexes.push({ columns: [columnName], indexType: impl.array ? 'gin' : 'btree' });
  }
  for (const add of additionalSearchColumns) {
    if (add.table !== tableDefinition.name) {
      continue;
    }
    tableDefinition.columns.push({ name: add.column, type: add.type });
    tableDefinition.indexes.push({ columns: [add.column], indexType: add.indexType });
  }
}

const additionalSearchColumns: { table: string; column: string; type: string; indexType: IndexType }[] = [
  { table: 'MeasureReport', column: 'period_range', type: 'TSTZRANGE', indexType: 'gist' },
];

function getColumnType(impl: SearchParameterImplementation): string {
  let baseColumnType: string;
  switch (impl.type) {
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
      if ('columnName' in impl && impl.columnName === 'priorityOrder') {
        baseColumnType = 'INTEGER';
      } else {
        baseColumnType = 'DOUBLE PRECISION';
      }
      break;
    default:
      baseColumnType = 'TEXT';
      break;
  }

  return impl.array ? baseColumnType + '[]' : baseColumnType;
}

function buildSearchIndexes(result: TableDefinition, resourceType: string): void {
  if (resourceType === 'User') {
    result.indexes.push({ columns: ['email'], indexType: 'btree' });
  }

  // uniqueness of SearchParameter-based indexes cannot be specified anywhere, so do it manually here
  // perhaps this should  also be moved to getSearchParameterDetails. Or preferably, where ever the
  // implementation-specific parts of SearchParameterDetails are moved to?
  // Or maybe even better would be an extension on the SearchParameter resource itself that
  // getSearchParameterDetails looks for
  if (resourceType === 'DomainConfiguration') {
    const domainIdx = result.indexes.find((i) => i.columns.length === 1 && i.columns[0] === 'domain');
    if (!domainIdx) {
      throw new Error('DomainConfiguration.domain index not found');
    }
    domainIdx.unique = true;
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
    columns: [{ name: 'resourceId', type: 'UUID NOT NULL' }],
    indexes: [{ columns: ['resourceId'], indexType: 'btree' }],
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
      { name: 'resourceId', type: 'UUID NOT NULL' },
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
  b.append(')`);');
  b.newLine();

  if (tableDefinition.compositePrimaryKey !== undefined && tableDefinition.compositePrimaryKey.length > 0) {
    writeAddPrimaryKey(b, tableDefinition, tableDefinition.compositePrimaryKey);
  }

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
  for (const startColumn of startTable.columns) {
    if (!targetTable.columns.some((c) => c.name === startColumn.name)) {
      writeDropColumn(b, targetTable, startColumn);
    }
  }
}

function normalizeColumnType(column: ColumnDefinition): string {
  return column.type
    .replaceAll('TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ')
    .replaceAll(' PRIMARY KEY', '')
    .replaceAll(' DEFAULT FALSE', '')
    .replaceAll(' NOT NULL', '')
    .trim();
}

function writeAddColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ADD COLUMN IF NOT EXISTS "${columnDefinition.name}" ${columnDefinition.type}');`
  );
}

function writeUpdateColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ALTER COLUMN "${columnDefinition.name}" TYPE ${columnDefinition.type}');`
  );
}

function writeDropColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" DROP COLUMN IF EXISTS "${columnDefinition.name}"');`
  );
}

function writeAddPrimaryKey(b: FileBuilder, tableDefinition: TableDefinition, primaryKeyColumns: string[]): void {
  b.appendNoWrap(
    `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ADD PRIMARY KEY (${primaryKeyColumns.map((c) => `"${c}"`).join(', ')})');`
  );
}

function migrateIndexes(b: FileBuilder, startTable: TableDefinition, targetTable: TableDefinition): void {
  const matchedIndexes = new Set<IndexDefinition>();
  for (const targetIndex of targetTable.indexes) {
    const startIndex = startTable.indexes.find((i) => indexDefinitionsEqual(i, targetIndex));
    if (!startIndex) {
      writeAddIndex(b, targetTable, targetIndex);
    } else {
      matchedIndexes.add(startIndex);
    }
  }

  if (LOG_UNMATCHED_INDEXES) {
    for (const startIndex of startTable.indexes) {
      if (!matchedIndexes.has(startIndex)) {
        console.log(`[${startTable.name}] Unmatched start index`, JSON.stringify(startIndex));
      }
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

  result += 'INDEX CONCURRENTLY IF NOT EXISTS "';
  result += tableName;
  result += '_';
  result += index.columns.join('_');
  result += '_idx" ON "';
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

function getMigrationFilenames(): string[] {
  return readdirSync(SCHEMA_DIR).filter((filename) => /v\d+\.ts/.test(filename));
}

function getVersionFromFilename(filename: string): number {
  return parseInt(filename.replace('v', '').replace('.ts', ''), 10);
}

function getNextSchemaVersion(): number {
  const [lastSchemaVersion] = getMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => b - a);

  return lastSchemaVersion + 1;
}

function rewriteMigrationExports(): void {
  let exportFile =
    '/*\n' +
    ' * Generated by @medplum/generator\n' +
    ' * Do not edit manually.\n' +
    ' */\n\n' +
    "export * from './migration';\n";
  const filenamesWithoutExt = getMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => a - b)
    .map((version) => `v${version}`);
  for (const filename of filenamesWithoutExt) {
    exportFile += `export * as ${filename} from './${filename}';\n`;
    if (filename === 'v9') {
      exportFile += '/* CAUTION: LOAD-BEARING COMMENT */\n';
      exportFile +=
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */\n';
    }
  }
  writeFileSync(`${SCHEMA_DIR}/index.ts`, exportFile, { flag: 'w' });
}

function indexDefinitionsEqual(a: IndexDefinition, b: IndexDefinition): boolean {
  // Populate optional fields with default values before comparing
  a.unique ??= false;
  b.unique ??= false;

  // deepEquals has FHIR-specific logic, but IndexDefinition is simple enough that it works fine
  return deepEquals(a, b);
}

if (require.main === module) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}

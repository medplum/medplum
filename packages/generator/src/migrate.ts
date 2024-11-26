import {
  deepEquals,
  getAllDataTypes,
  getSearchParameterDetails,
  getSearchParameters,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  InternalTypeSchema,
  isPopulated,
  isResourceTypeSchema,
  SearchParameterDetails,
  SearchParameterType,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { FileBuilder } from './filebuilder';

const SCHEMA_DIR = resolve(__dirname, '../../server/src/migrations/schema');
let LOG_UNMATCHED_INDEXES = false;
let DRY_RUN = false;

export interface SchemaDefinition {
  tables: TableDefinition[];
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  compositePrimaryKey?: string[];
  indexes: IndexDefinition[];
}

interface ColumnDefinition {
  name: string;
  type: string;
  notNull?: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
}

const IndexTypes = ['btree', 'gin', 'gist'] as const;
type IndexType = (typeof IndexTypes)[number];

export type IndexColumn = {
  expression: string;
  name: string;
};

interface IndexDefinition {
  columns: (string | IndexColumn)[];
  indexType: IndexType;
  unique?: boolean;
}

export function indexStructureDefinitionsAndSearchParameters(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);

  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    const bundle = readJson(filename) as Bundle<SearchParameter>;
    indexSearchParameterBundle(bundle);

    if (!isPopulated(bundle.entry)) {
      throw new Error('Empty search parameter bundle: ' + filename);
    }
  }
}

export async function main(): Promise<void> {
  LOG_UNMATCHED_INDEXES = process.argv.includes('--logUnmatchedIndexes');
  DRY_RUN = process.argv.includes('--dryRun');

  indexStructureDefinitionsAndSearchParameters();

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
  // https://stackoverflow.com/questions/8146448/get-the-default-values-of-table-columns-in-postgres
  const rs = await db.query(`
    SELECT
      attname,
      attnotnull,
      format_type(atttypid, atttypmod) AS data_type,
      COALESCE(i.indisprimary, FALSE) as primary_key,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
    FROM
      pg_attribute
      JOIN pg_class ON pg_class.oid = attrelid
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      LEFT JOIN pg_index i ON attrelid = i.indrelid AND attnum = ANY(i.indkey)
      LEFT JOIN pg_catalog.pg_attrdef d ON (pg_attribute.attrelid, pg_attribute.attnum) = (d.adrelid, d.adnum)
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
    type: normalizeColumnType(row.data_type.toUpperCase()),
    primaryKey: Boolean(row.primary_key),
    notNull: row.attnotnull,
    defaultValue: row.default_value?.toLocaleUpperCase(),
  }));
}

async function getIndexes(db: Client, tableName: string): Promise<IndexDefinition[]> {
  const rs = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${tableName}'`);
  return rs.rows.map((row) => parseIndexDefinition(row.indexdef));
}

const IndexComponentExpressionRegexes = [/a2t\("?([\w]+)"?\) gin_trgm_ops/];

function parseIndexDefinition(indexdef: string): IndexDefinition {
  // Use a regex to get the column names or expressions inside the parentheses
  const matches = indexdef.match(/\((.+)\)$/);
  if (!matches) {
    throw new Error('Invalid index definition: ' + indexdef);
  }

  const indexType = indexdef.match(/USING (\w+)/)?.[1] as IndexType | undefined;
  if (indexType && !IndexTypes.includes(indexType)) {
    throw new Error('Invalid index type: ' + indexType);
  }

  const columns = matches[1].split(',').map((expression, i): IndexDefinition['columns'][number] => {
    if (IndexComponentExpressionRegexes.some((r) => r.test(expression))) {
      const idxNameMatch = indexdef.match(/"([a-zA-Z]+)_(\w+)_idx"/); // ResourceName_column1_column2_idx
      if (!idxNameMatch) {
        throw new Error('Could not parse index name from ' + indexdef);
      }

      let name = splitIndexColumnNames(idxNameMatch[2])[i]; // TODO: don't allow _ in column names?
      if (!name) {
        throw new Error('Could not parse index name component from ' + indexdef);
      }
      name = expandAbbreviations(name, ColumnNameAbbreviations);

      const ic: IndexColumn = {
        expression,
        name,
      };
      return ic;
    }

    return expression.trim().replaceAll('"', '');
  });

  return {
    columns,
    indexType: indexType ?? 'btree',
    unique: indexdef.includes('CREATE UNIQUE INDEX'),
  };
}

/**
 * Splits a string on leading single underscores.
 * e.g. 'col1__col2___col3' => ['col1', '_col2', '__col3']
 * @param indexColumnNames - The string to split
 * @returns The split string
 */
function splitIndexColumnNames(indexColumnNames: string): string[] {
  const parts = indexColumnNames.split('_');
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part === '') {
      parts[i + 1] = '_' + parts[i + 1];
      parts.splice(i, 1);
      i++;
    }
  }
  return parts;
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

export function buildCreateTables(result: SchemaDefinition, resourceType: string, fhirType: InternalTypeSchema): void {
  if (!isResourceTypeSchema(fhirType)) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }

  const tableDefinition: TableDefinition = {
    name: resourceType,
    columns: [
      { name: 'id', type: 'UUID', primaryKey: true, notNull: true },
      { name: 'content', type: 'TEXT', notNull: true },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'deleted', type: 'BOOLEAN', notNull: true, defaultValue: 'FALSE' },
      { name: 'compartments', type: 'UUID[]', notNull: true },
      { name: 'projectId', type: 'UUID' },
      { name: '_source', type: 'TEXT' },
      { name: '_profile', type: 'TEXT[]' },
    ],
    indexes: [
      { columns: ['lastUpdated'], indexType: 'btree' },
      { columns: ['compartments'], indexType: 'gin' },
      { columns: ['projectId'], indexType: 'btree' },
      { columns: ['_source'], indexType: 'btree' },
      { columns: ['_profile'], indexType: 'gin' },
    ],
  };

  buildSearchColumns(tableDefinition, resourceType);
  buildSearchIndexes(tableDefinition, resourceType);
  result.tables.push(tableDefinition);

  result.tables.push({
    name: resourceType + '_History',
    columns: [
      { name: 'versionId', type: 'UUID', primaryKey: true, notNull: true },
      { name: 'id', type: 'UUID', notNull: true },
      { name: 'content', type: 'TEXT', notNull: true },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ', notNull: true },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree' },
      { columns: ['lastUpdated'], indexType: 'btree' },
    ],
  });

  result.tables.push({
    name: resourceType + '_Token',
    columns: [
      { name: 'resourceId', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
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
      { name: 'resourceId', type: 'UUID', notNull: true },
      { name: 'targetId', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
    ],
    compositePrimaryKey: ['resourceId', 'targetId', 'code'],
    indexes: [],
  });
}

const IgnoredSearchParameters = new Set(['_id', '_lastUpdated', '_profile', '_compartment', '_source']);

function buildSearchColumns(tableDefinition: TableDefinition, resourceType: string): void {
  const resourceTypeSearchParams = getSearchParameters(resourceType) ?? {};
  const derivedSearchParams: SearchParameter[] = [];
  for (const paramList of [Object.values(resourceTypeSearchParams), derivedSearchParams]) {
    for (const searchParam of paramList) {
      if (searchParam.type === 'composite') {
        continue;
      }

      if (IgnoredSearchParameters.has(searchParam.code)) {
        // console.log(searchParam.code, searchParam.type);
        continue;
      } else if (!searchParam.base?.includes(resourceType as ResourceType)) {
        // console.log('SKIPPING', searchParam.code, searchParam.base);
        continue;
      } else {
        // console.log('HANDLING', searchParam.code, searchParam.base);
      }

      const details = getSearchParameterDetails(resourceType, searchParam);
      if (details.implementation === 'lookup-table') {
        continue;
      }

      if (searchParam.type === 'reference') {
        derivedSearchParams.push(deriveIdentifierSearchParameter(searchParam));
      }

      for (const column of getSearchParameterColumns(searchParam, details)) {
        const existing = tableDefinition.columns.find((c) => c.name === column.name);
        if (existing) {
          if (!deepEquals(existing, column)) {
            throw new Error(
              `Search Parameter ${searchParam.id ?? searchParam.code} attempting to define the same column on ${tableDefinition.name} with conflicting types: ${existing.type} vs ${column.type}`
            );
          }
          continue;
        }
        tableDefinition.columns.push(column);
      }
      for (const index of getSearchParameterIndexes(searchParam, details)) {
        const existing = tableDefinition.indexes.find((i) => deepEquals(i, index));
        if (existing) {
          continue;
        }
        tableDefinition.indexes.push(index);
      }
    }
  }

  for (const add of additionalSearchColumns) {
    if (add.table !== tableDefinition.name) {
      continue;
    }
    tableDefinition.columns.push({ name: add.column, type: add.type });
    tableDefinition.indexes.push({ columns: [add.column], indexType: add.indexType });
  }
}

function getSearchParameterColumns(_searchParam: SearchParameter, details: SearchParameterDetails): ColumnDefinition[] {
  if (details.implementation === 'token-columns') {
    const columns: ColumnDefinition[] = [
      // { name: details.columnName, type: getColumnType(details) },
      // { name: details.columnName + 'Text', type: getColumnType(details) },
      getColumnDefinition(details.columnName, details),
      getColumnDefinition(details.columnName + 'Text', details),
    ];
    return columns;
  }

  return [getColumnDefinition(details.columnName, details)];
}

const TableAbbrieviations: Record<string, string | undefined> = {
  MedicinalProductAuthorization: 'MPA',
  MedicinalProductContraindication: 'MPC',
  MedicinalProductPharmaceutical: 'MPP',
  MedicinalProductUndesirableEffect: 'MPUE',
};

const ColumnNameAbbreviations: Record<string, string | undefined> = {
  participatingOrganization: 'partOrg',
  primaryOrganization: 'primOrg',
};

function applyAbbreviations(name: string, abbreviations: Record<string, string | undefined>): string {
  let result = name;
  for (const [original, abbrev] of Object.entries(abbreviations as Record<string, string>)) {
    result = result.replace(original, abbrev);
  }
  return result;
}

function expandAbbreviations(name: string, abbreviations: Record<string, string | undefined>): string {
  let result = name;
  for (const [original, abbrev] of Object.entries(abbreviations as Record<string, string>).reverse()) {
    result = result.replace(abbrev, original);
  }
  return result;
}

function getSearchParameterIndexes(_searchParam: SearchParameter, details: SearchParameterDetails): IndexDefinition[] {
  if (details.implementation === 'token-columns') {
    const indexes: IndexDefinition[] = [];
    for (const columnName of [details.columnName, details.columnName + 'Text']) {
      const escapedName = columnName === columnName.toLocaleLowerCase() ? columnName : '"' + columnName + '"';
      indexes.push({ columns: [columnName], indexType: 'gin' });
      // TO facilitate matching with parsed start index definitions, only wrap in quotes
      // when necessary since that is behavior of `SELECT indexdef FROM pg_indexes`
      indexes.push({
        columns: [{ expression: `a2t(${escapedName}) gin_trgm_ops`, name: columnName + 'Trgm' }],
        indexType: 'gin',
      });
    }
    return indexes;
  }
  return [{ columns: [details.columnName], indexType: details.array ? 'gin' : 'btree' }];
}

const additionalSearchColumns: { table: string; column: string; type: string; indexType: IndexType }[] = [
  { table: 'MeasureReport', column: 'period_range', type: 'TSTZRANGE', indexType: 'gist' },
];

function getColumnDefinition(name: string, details: SearchParameterDetails): ColumnDefinition {
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
  let type: string;
  let notNull: boolean = false;
  let defaultValue: string | undefined;

  if (details.implementation === 'token-columns') {
    if (baseColumnType.toLocaleUpperCase() !== 'TEXT') {
      throw new Error('Token columns must have TEXT column type');
    }

    // To simplify we always use arrays for token columns even if they can only have a single value
    // We should re-evaluate this decision before ever going live with inlined token columns since
    // array columns have performance costs
    // columnType += details.array ? `DEFAULT ARRAY[]::${baseColumnType}[] NOT NULL` : ' NOT NULL';

    // e.g. 'TEXT[] DEFAULT ARRAY[]::text[] NOT NULL'
    type = `TEXT[]`;
    notNull = true;
    defaultValue = 'ARRAY[]::TEXT[]';
  } else {
    type = details.array ? baseColumnType + '[]' : baseColumnType;
  }

  return {
    name,
    type,
    notNull,
    defaultValue,
  };
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
    columns: [{ name: 'resourceId', type: 'UUID', notNull: true }],
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
      { name: 'resourceId', type: 'UUID' }, // For data from previous implementations, resourceId is nullable
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
    } else if (!columnDefinitionsEqual(startColumn, targetColumn)) {
      // console.log('START ', normalizeColumnType(startColumn));
      // console.log('TARGET', normalizeColumnType(targetColumn));
      writeUpdateColumn(b, targetTable, startColumn, targetColumn);
    }
  }
  for (const startColumn of startTable.columns) {
    if (!targetTable.columns.some((c) => c.name === startColumn.name)) {
      writeDropColumn(b, targetTable, startColumn);
    }
  }
}

function normalizeColumnType(colType: string): string {
  return colType.toLocaleUpperCase().replace('TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ').trim();
}

function writeAddColumn(b: FileBuilder, tableDefinition: TableDefinition, columnDefinition: ColumnDefinition): void {
  const { name, type, notNull, primaryKey, defaultValue } = columnDefinition;
  b.appendNoWrap(
    `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ADD COLUMN IF NOT EXISTS "${name}" ${type}${notNull ? ' NOT NULL' : ''}${primaryKey ? ' PRIMARY KEY' : ''}${defaultValue ? ' DEFAULT ' + defaultValue : ''}');`
  );
}

function writeUpdateColumn(
  b: FileBuilder,
  tableDefinition: TableDefinition,
  startDef: ColumnDefinition,
  targetDef: ColumnDefinition
): void {
  if (startDef.defaultValue !== targetDef.defaultValue) {
    // ALTER TABLE IF EXISTS "Account" ALTER COLUMN "_security" SET DEFAULT ARRAY[]::TEXT[];
    if (targetDef.defaultValue) {
      b.appendNoWrap(
        `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ALTER COLUMN "${targetDef.name}" SET DEFAULT ${targetDef.defaultValue}');`
      );
    } else {
      b.appendNoWrap(
        `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ALTER COLUMN "${targetDef.name}" DROP DEFAULT');`
      );
    }
  }

  if (startDef.notNull !== targetDef.notNull) {
    // ALTER TABLE IF EXISTS "Account" ALTER COLUMN "_security" SET NOT NULL;
    b.appendNoWrap(
      `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ALTER COLUMN "${targetDef.name}" ${targetDef.notNull ? 'SET' : 'DROP'} NOT NULL');`
    );
  }

  if (startDef.type !== targetDef.type) {
    b.appendNoWrap(
      `await client.query('ALTER TABLE IF EXISTS "${tableDefinition.name}" ALTER COLUMN "${targetDef.name}" TYPE ${targetDef.type}');`
    );
  }
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
  let indexName = applyAbbreviations(tableName, TableAbbrieviations) + '_';
  indexName += index.columns
    .map((c) => (typeof c === 'string' ? c : c.name))
    .map((c) => applyAbbreviations(c, ColumnNameAbbreviations))
    .join('_');
  indexName += '_idx';

  if (indexName.length > 63) {
    throw new Error('Index name too long: ' + indexName);
  }

  let result = 'CREATE ';

  if (index.unique) {
    result += 'UNIQUE ';
  }

  result += 'INDEX CONCURRENTLY IF NOT EXISTS "';
  result += indexName;
  result += '" ON "';
  result += tableName;
  result += '" ';

  if (index.indexType === 'gin') {
    result += 'USING gin ';
  }

  result += '(';
  result += index.columns.map((c) => (typeof c === 'string' ? `"${c}"` : c.expression)).join(', ');
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

function columnDefinitionsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
  for (const def of [a, b]) {
    def.defaultValue ??= undefined;
    def.notNull ??= false;
    def.primaryKey ??= false;
  }
  return deepEquals(a, b);
}

// Copied from packages/server/src/fhir/lookups/util.ts
// TODO - dedupe this (by moving to core?)
function deriveIdentifierSearchParameter(inputParam: SearchParameter): SearchParameter {
  return {
    resourceType: 'SearchParameter',
    code: inputParam.code + ':identifier',
    base: inputParam.base,
    type: 'token',
    expression: `(${inputParam.expression}).identifier`,
  } as SearchParameter;
}

if (require.main === module) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}

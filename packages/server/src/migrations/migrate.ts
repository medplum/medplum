import {
  deepEquals,
  FileBuilder,
  getAllDataTypes,
  getSearchParameters,
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
import { Client, Pool } from 'pg';
import {
  ColumnSearchParameterImplementation,
  getSearchParameterImplementation,
  SearchParameterImplementation,
} from '../fhir/searchparameter';
import { deriveIdentifierSearchParameter } from '../fhir/lookups/util';
import { doubleEscapeSingleQuotes, parseIndexColumns, splitIndexColumnNames } from './migrate-utils';

const SCHEMA_DIR = resolve(__dirname, 'schema');
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

export interface IndexDefinition {
  columns: (string | IndexColumn)[];
  indexType: IndexType;
  unique?: boolean;
  include?: string[];
  where?: string;
  indexNameSuffix?: string;
  indexdef?: string;
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
  DRY_RUN = process.argv.includes('--dryRun');

  indexStructureDefinitionsAndSearchParameters();

  const dbClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'medplum',
    user: 'medplum',
    password: 'medplum',
  });
  const options: BuildMigrationOptions = {
    dbClient,
    dropUnmatchedIndexes: process.argv.includes('--dropUnmatchedIndexes'),
  };
  await dbClient.connect();

  const b = new FileBuilder();
  await buildMigration(b, options);

  await dbClient.end();
  if (DRY_RUN) {
    console.log(b.toString());
  } else {
    writeFileSync(`${SCHEMA_DIR}/v${getNextSchemaVersion()}.ts`, b.toString(), 'utf8');
    rewriteMigrationExports();
  }
}

export type BuildMigrationOptions = {
  dbClient: Client | Pool;
  dropUnmatchedIndexes?: boolean;
};

export async function buildMigration(b: FileBuilder, options: BuildMigrationOptions): Promise<void> {
  const startDefinition = await buildStartDefinition(options);
  const targetDefinition = buildTargetDefinition();
  writeMigrations(b, startDefinition, targetDefinition, options);
}

async function buildStartDefinition(options: BuildMigrationOptions): Promise<SchemaDefinition> {
  const db = options.dbClient;

  const tableNames = await getTableNames(db);
  const tables: TableDefinition[] = [];

  for (const tableName of tableNames) {
    tables.push(await getTableDefinition(db, tableName));
  }

  const unusedParsers = SpecialIndexParsers.filter((p) => !p.usageCount);
  if (unusedParsers.length) {
    throw new Error('Unused special index parsers:\n' + unusedParsers.map((p) => p.toString()).join('\n'));
  }

  return { tables };
}

async function getTableNames(db: Client | Pool): Promise<string[]> {
  const rs = await db.query("SELECT * FROM information_schema.tables WHERE table_schema='public'");
  return rs.rows.map((row) => row.table_name);
}

async function getTableDefinition(db: Client | Pool, name: string): Promise<TableDefinition> {
  return {
    name,
    columns: await getColumns(db, name),
    indexes: await getIndexes(db, name),
  };
}

async function getColumns(db: Client | Pool, tableName: string): Promise<ColumnDefinition[]> {
  // https://stackoverflow.com/questions/8146448/get-the-default-values-of-table-columns-in-postgres
  const rs = await db.query(`
    SELECT
      attname,
      attnotnull,
      format_type(atttypid, atttypmod) AS data_type,
      COALESCE((SELECT indisprimary from pg_index where indrelid = attrelid AND attnum = any(indkey) and indisprimary = true), FALSE) AS primary_key,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
    FROM
      pg_attribute
      JOIN pg_class ON pg_class.oid = attrelid
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
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
    defaultValue: row.default_value,
  }));
}

async function getIndexes(db: Client | Pool, tableName: string): Promise<IndexDefinition[]> {
  const rs = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='${tableName}'`);
  return rs.rows.map((row) => parseIndexDefinition(row.indexdef));
}

// If the index definition is beyond the ability of the parser, define a special-handler function here
type SpecialIndexParser = ((indexdef: string) => IndexDefinition | undefined) & { usageCount?: number };
const SpecialIndexParsers: SpecialIndexParser[] = [
  // example special parser that is no longer needed
  // (indexdef: string) => {
  //   // CREATE INDEX "Coding_display_idx" ON public."Coding" USING gin (system, to_tsvector('english'::regconfig, display)) WHERE (display IS NOT NULL)
  //   const tsVectorExpr = tsVectorExpression('english', 'display');
  //   const match = indexdef.endsWith(`USING gin (system, ${tsVectorExpr}) WHERE (display IS NOT NULL)`);
  //   if (!match) {
  //     return undefined;
  //   }
  //   return {
  //     columns: ['system', { expression: tsVectorExpr, name: 'display' }],
  //     indexType: 'gin',
  //     where: 'display IS NOT NULL',
  //   };
  // },
];

export function parseIndexDefinition(indexdef: string): IndexDefinition {
  const fullIndexDef = indexdef;

  const specialMatches = SpecialIndexParsers.map((p) => {
    const result = p(indexdef);
    if (result) {
      p.usageCount = (p.usageCount ?? 0) + 1;
    }
    return p(indexdef);
  }).filter((d): d is IndexDefinition => !!d);
  if (specialMatches.length > 1) {
    throw new Error('Multiple special index parsers matched: ' + indexdef);
  } else if (specialMatches.length === 1) {
    specialMatches[0].indexdef = fullIndexDef;
    return specialMatches[0];
  }

  let where: string | undefined;
  const whereMatch = indexdef.match(/ WHERE \((.+)\)$/);
  if (whereMatch) {
    where = whereMatch[1];
    indexdef = indexdef.substring(0, whereMatch.index);
  }

  let include: string[] | undefined;
  const includeMatch = indexdef.match(/ INCLUDE \((.+)\)$/);
  if (includeMatch) {
    include = includeMatch[1].split(',').map((s) => s.trim().replaceAll('"', ''));
    indexdef = indexdef.substring(0, includeMatch.index);
  }

  const indexTypeMatch = indexdef.match(/USING (\w+)/);
  if (!indexTypeMatch) {
    throw new Error('Could not parse index type from ' + indexdef);
  }

  const indexType = indexTypeMatch[1] as IndexType;
  if (!IndexTypes.includes(indexType)) {
    throw new Error('Invalid index type: ' + indexType);
  }

  const expressionsMatch = indexdef.match(/\((.+)\)$/);
  if (!expressionsMatch) {
    throw new Error('Invalid index definition: ' + indexdef);
  }

  const parsedExpressions = parseIndexColumns(expressionsMatch[1]);
  const columns = parsedExpressions.map<IndexDefinition['columns'][number]>((expression, i) => {
    if (expression.match(/^[ \w"]+$/)) {
      return expression.trim().replaceAll('"', '');
    }

    const idxNameMatch = indexdef.match(/INDEX "([a-zA-Z]+)_(\w+)_(idx|idx_tsv)"/); // ResourceName_column1_column2_idx
    if (!idxNameMatch) {
      throw new Error('Could not parse index name from ' + indexdef);
    }

    let name = splitIndexColumnNames(idxNameMatch[2])[i];
    if (!name) {
      // column names aren't considered when determining index equality, so it is fine to use a placeholder
      // name here. If we want to be stricter and match on index name as well, throw an error here instead
      // of using a placeholder name among other changes
      name = 'placeholder';
    }
    name = expandAbbreviations(name, ColumnNameAbbreviations);

    return { expression, name };
  });

  const indexDef: IndexDefinition = {
    columns,
    indexType: indexType,
    unique: indexdef.includes('CREATE UNIQUE INDEX'),
    indexdef: fullIndexDef,
  };

  if (where) {
    indexDef.where = where;
  }

  if (include) {
    indexDef.include = include;
  }

  return indexDef;
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
  buildCodingTable(result);
  buildCodingPropertyTable(result);

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
      { name: 'deleted', type: 'BOOLEAN', notNull: true, defaultValue: 'false' },
      { name: 'compartments', type: 'UUID[]', notNull: true },
      { name: 'projectId', type: 'UUID' },
      { name: '_source', type: 'TEXT' },
      { name: '_profile', type: 'TEXT[]' },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree', unique: true },
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
      { columns: ['versionId'], indexType: 'btree', unique: true },
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
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, value)", name: 'text' }],
        indexType: 'gin',
        where: "system = 'text'::text",
        indexNameSuffix: 'idx_tsv',
      },
      { columns: ['code', 'value'], indexType: 'btree', include: ['resourceId'] },
      { columns: ['code', 'system', 'value'], indexType: 'btree', include: ['resourceId'] },
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
    indexes: [
      { columns: ['resourceId', 'targetId', 'code'], indexType: 'btree', unique: true },
      { columns: ['targetId', 'code'], indexType: 'btree', include: ['resourceId'] },
    ],
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
        continue;
      }

      if (!searchParam.base?.includes(resourceType as ResourceType)) {
        throw new Error(
          `${searchParam.id}: SearchParameter.base ${searchParam.base.join(',')} does not include resourceType ${resourceType}`
        );
      }

      const impl = getSearchParameterImplementation(resourceType, searchParam);
      if (impl.searchStrategy === 'lookup-table') {
        continue;
      }

      if (searchParam.type === 'reference') {
        derivedSearchParams.push(deriveIdentifierSearchParameter(searchParam));
      }

      for (const column of getSearchParameterColumns(impl)) {
        const existing = tableDefinition.columns.find((c) => c.name === column.name);
        if (existing) {
          if (!columnDefinitionsEqual(existing, column)) {
            throw new Error(
              `Search Parameter ${searchParam.id ?? searchParam.code} attempting to define the same column on ${tableDefinition.name} with conflicting types: ${existing.type} vs ${column.type}`
            );
          }
          continue;
        }
        tableDefinition.columns.push(column);
      }
      for (const index of getSearchParameterIndexes(impl)) {
        const existing = tableDefinition.indexes.find((i) => indexDefinitionsEqual(i, index));
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

function getSearchParameterColumns(impl: ColumnSearchParameterImplementation): ColumnDefinition[] {
  return [getColumnDefinition(impl.columnName, impl)];
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

function getSearchParameterIndexes(impl: ColumnSearchParameterImplementation): IndexDefinition[] {
  return [{ columns: [impl.columnName], indexType: impl.array ? 'gin' : 'btree' }];
}

const additionalSearchColumns: { table: string; column: string; type: string; indexType: IndexType }[] = [
  { table: 'MeasureReport', column: 'period_range', type: 'TSTZRANGE', indexType: 'gist' },
];

function getColumnDefinition(name: string, impl: SearchParameterImplementation): ColumnDefinition {
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
  const type = impl.array ? baseColumnType + '[]' : baseColumnType;

  return {
    name,
    type,
    notNull: false,
  };
}

function buildSearchIndexes(result: TableDefinition, resourceType: string): void {
  if (resourceType === 'UserConfiguration') {
    const nameCol = result.columns.find((c) => c.name === 'name');
    if (!nameCol) {
      throw new Error('Could not find UserConfiguration.name column');
    }
    nameCol.defaultValue = "''::text";
  }

  if (resourceType === 'User') {
    result.indexes.push({ columns: ['email'], indexType: 'btree' });
    result.indexes.push({ columns: ['project', 'email'], indexType: 'btree', unique: true });
    result.indexes.push({ columns: ['project', 'externalId'], indexType: 'btree', unique: true });
  }

  if (resourceType === 'Coding') {
    result.indexes.push({ columns: ['system', 'code'], indexType: 'btree', unique: true, include: ['id', 'foo'] });
  }

  if (resourceType === 'Encounter') {
    result.indexes.push({ columns: ['compartments', 'deleted', 'appointment'], indexType: 'gin', unique: false });
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

  if (resourceType === 'ServiceRequest') {
    const orderDetail = result.columns.find((c) => c.name === 'orderDetail');
    if (!orderDetail) {
      throw new Error('Could not find ServiceRequest.orderDetail column');
    }
    orderDetail.defaultValue = "'{}'::text[]";
  }

  if (resourceType === 'ProjectMembership') {
    const profileCol = result.columns.find((c) => c.name === 'profile');
    if (!profileCol) {
      throw new Error('Could not find ProjectMembership.profile column');
    }
    profileCol.defaultValue = "''::text";

    result.indexes.push({
      columns: ['project', 'externalId'],
      indexType: 'btree',
      unique: true,
    });
    result.indexes.push({ columns: ['project', 'userName'], indexType: 'btree', unique: true });
  }
}

function buildAddressTable(result: SchemaDefinition): void {
  buildLookupTable(
    result,
    'Address',
    ['address', 'city', 'country', 'postalCode', 'state', 'use'],
    [
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, address)", name: 'address' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: 'to_tsvector(\'simple\'::regconfig, "postalCode")', name: 'postalCode' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, city)", name: 'city' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, use)", name: 'use' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, country)", name: 'country' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, state)", name: 'state' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
    ]
  );
}

function buildContactPointTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'ContactPoint', ['system', 'value']);
}

function buildIdentifierTable(result: SchemaDefinition): void {
  buildLookupTable(result, 'Identifier', ['system', 'value']);
}

function buildHumanNameTable(result: SchemaDefinition): void {
  buildLookupTable(
    result,
    'HumanName',
    ['name', 'given', 'family'],
    [
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, name)", name: 'name' }],
        indexType: 'gin',
        unique: false,
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, given)", name: 'given' }],
        indexType: 'gin',
        unique: false,
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, family)", name: 'family' }],
        indexType: 'gin',
        unique: false,
      },
    ]
  );
}

function buildLookupTable(
  result: SchemaDefinition,
  tableName: string,
  columns: string[],
  additionalIndexes?: IndexDefinition[]
): void {
  const tableDefinition: TableDefinition = {
    name: tableName,
    columns: [{ name: 'resourceId', type: 'UUID', notNull: true }],
    indexes: [{ columns: ['resourceId'], indexType: 'btree' }],
  };

  for (const column of columns) {
    tableDefinition.columns.push({ name: column, type: 'TEXT' });
    tableDefinition.indexes.push({ columns: [column], indexType: 'btree' });
  }

  if (additionalIndexes?.length) {
    tableDefinition.indexes.push(...additionalIndexes);
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
      { columns: ['resourceId'], indexType: 'btree' },
      { columns: ['system'], indexType: 'btree' },
      { columns: ['code'], indexType: 'btree' },
      { columns: ['display'], indexType: 'btree' },
      {
        columns: [{ expression: "to_tsvector('english'::regconfig, display)", name: 'display' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
    ],
  });
}

function buildCodingTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'Coding',
    columns: [
      { name: 'id', type: 'BIGINT', notNull: true, defaultValue: 'nextval(\'"Coding_id_seq"\'::regclass)' },
      { name: 'system', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
      { name: 'display', type: 'TEXT' },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree', unique: true },
      { columns: ['system', 'code'], indexType: 'btree', unique: true, include: ['id'] },
      {
        columns: ['system', { expression: "to_tsvector('english'::regconfig, display)", name: 'display' }],
        indexType: 'gin',
        where: 'display IS NOT NULL',
      },
      // This index definition is cheating since "display gin_trgm_ops" is of course not just a column name
      // It should have a special parser
      { columns: ['system', 'display gin_trgm_ops'], indexType: 'gin' },
    ],
  });
}

function buildCodingPropertyTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'Coding_Property',
    columns: [
      { name: 'coding', type: 'BIGINT', notNull: true },
      { name: 'property', type: 'BIGINT', notNull: true },
      { name: 'target', type: 'BIGINT' },
      { name: 'value', type: 'TEXT' },
    ],
    compositePrimaryKey: ['target', 'property', 'coding'],
    indexes: [
      { columns: ['coding', 'property', 'target', 'value'], indexType: 'btree', unique: true },
      { columns: ['target', 'property', 'coding'], indexType: 'btree', unique: false, where: 'target IS NOT NULL' },
      { columns: ['coding'], indexType: 'btree', unique: false },
    ],
  });
}

function writeMigrations(
  b: FileBuilder,
  startDefinition: SchemaDefinition,
  targetDefinition: SchemaDefinition,
  options: BuildMigrationOptions
): void {
  b.append("import { PoolClient } from 'pg';");
  b.newLine();
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;

  for (const targetTable of targetDefinition.tables) {
    const startTable = startDefinition.tables.find((t) => t.name === targetTable.name);
    migrateTable(b, startTable, targetTable, options);
  }

  b.indentCount--;
  b.append('}');
}

function migrateTable(
  b: FileBuilder,
  startTable: TableDefinition | undefined,
  targetTable: TableDefinition,
  options: BuildMigrationOptions
): void {
  if (!startTable) {
    writeCreateTable(b, targetTable);
  } else {
    migrateColumns(b, startTable, targetTable);
    migrateIndexes(b, startTable, targetTable, options);
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

function migrateIndexes(
  b: FileBuilder,
  startTable: TableDefinition,
  targetTable: TableDefinition,
  options: BuildMigrationOptions
): void {
  const matchedIndexes = new Set<IndexDefinition>();
  for (const targetIndex of targetTable.indexes) {
    const startIndex = startTable.indexes.find((i) => indexDefinitionsEqual(i, targetIndex));
    if (!startIndex) {
      writeAddIndex(b, targetTable, targetIndex);
    } else {
      matchedIndexes.add(startIndex);
    }
  }

  for (const startIndex of startTable.indexes) {
    if (!matchedIndexes.has(startIndex)) {
      console.log(
        `[${startTable.name}] Existing index should not exist:`,
        startIndex.indexdef || JSON.stringify(startIndex)
      );
      if (options?.dropUnmatchedIndexes) {
        const indexName = startIndex.indexdef?.match(/INDEX "?(.+)"? ON/)?.[1];
        if (!indexName) {
          throw new Error('Could not extract index name from ' + startIndex.indexdef);
        }
        writeDropIndex(b, indexName);
      }
    }
  }
}

function writeAddIndex(b: FileBuilder, tableDefinition: TableDefinition, indexDefinition: IndexDefinition): void {
  b.appendNoWrap(`await client.query('${buildIndexSql(tableDefinition.name, indexDefinition)}');`);
}

function writeDropIndex(b: FileBuilder, indexName: string): void {
  b.appendNoWrap(`await client.query('DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"');`);
}

function buildIndexSql(tableName: string, index: IndexDefinition): string {
  let indexName = applyAbbreviations(tableName, TableAbbrieviations) + '_';
  indexName += index.columns
    .map((c) => (typeof c === 'string' ? c : c.name))
    .map((c) => applyAbbreviations(c, ColumnNameAbbreviations))
    .join('_');
  indexName += '_' + (index.indexNameSuffix ?? 'idx');

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
  result += index.columns
    .map((c) => (typeof c === 'string' ? `"${c}"` : doubleEscapeSingleQuotes(c.expression)))
    .join(', ');
  result += ')';

  if (index.include) {
    result += ' INCLUDE (';
    result += index.include.map((c) => `"${c}"`).join(', ');
    result += ')';
  }

  if (index.where) {
    result += ' WHERE (';
    result += doubleEscapeSingleQuotes(index.where);
    result += ')';
  }

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

export function indexDefinitionsEqual(a: IndexDefinition, b: IndexDefinition): boolean {
  const [aPrime, bPrime] = [a, b].map((d) => {
    return {
      ...d,
      unique: d.unique ?? false,
      // don't care about indexNameSuffix, indexdef, nor expression names
      indexNameSuffix: undefined,
      indexdef: undefined,
      columns: d.columns.map((c) => (typeof c === 'string' ? c : c.expression)),
    };
  });

  return deepEquals(aPrime, bPrime);
}

function columnDefinitionsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
  // Populate optional fields with default values before comparing
  for (const def of [a, b]) {
    def.defaultValue ??= undefined;
    def.notNull ??= false;
    def.primaryKey ??= false;
  }

  // deepEquals has FHIR-specific logic, but ColumnDefinition is simple enough that it works fine
  return deepEquals(a, b);
}

if (require.main === module) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}

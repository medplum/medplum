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
import { Client, escapeIdentifier, Pool, PoolClient, QueryResult } from 'pg';
import { getStandardAndDerivedSearchParameters } from '../fhir/lookups/util';
import {
  ColumnSearchParameterImplementation,
  getSearchParameterImplementation,
  SearchParameterImplementation,
  TokenColumnSearchParameterImplementation,
} from '../fhir/searchparameter';
import { SqlFunctionDefinition, TokenArrayToTextFn } from '../fhir/sql';
import { isLegacyTokenColumnSearchParameter } from '../fhir/tokens';
import * as fns from './migrate-functions';
import { escapeUnicode, normalizeColumnType, parseIndexColumns, splitIndexColumnNames } from './migrate-utils';
import {
  ColumnDefinition,
  IndexDefinition,
  IndexType,
  IndexTypes,
  MigrationAction,
  MigrationActionResult,
  SchemaDefinition,
  TableDefinition,
} from './types';

const SCHEMA_DIR = resolve(__dirname, 'schema');

// Custom SQL functions should be avoided unless absolutely necessary.
// Do not add any functions to this list unless you have a really good reason for doing so.
const TargetFunctions: SqlFunctionDefinition[] = [TokenArrayToTextFn];

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
  const dryRun = process.argv.includes('--dryRun');

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
    skipPostDeployActions: process.argv.includes('--skipPostDeploy'),
    allowPostDeployActions: process.argv.includes('--allowPostDeploy'),
    dropUnmatchedIndexes: process.argv.includes('--dropUnmatchedIndexes'),
    analyzeResourceTables: process.argv.includes('--analyzeResourceTables'),
  };
  await dbClient.connect();

  const b = new FileBuilder();
  await buildMigration(b, options);

  await dbClient.end();
  if (dryRun) {
    console.log(b.toString());
  } else {
    writeFileSync(`${SCHEMA_DIR}/v${getNextSchemaVersion()}.ts`, b.toString(), 'utf8');
    rewriteMigrationExports();
  }
}

export type BuildMigrationOptions = {
  dbClient: Client | Pool | PoolClient;
  dropUnmatchedIndexes?: boolean;
  skipPostDeployActions?: boolean;
  allowPostDeployActions?: boolean;
  analyzeResourceTables?: boolean;
};

export async function buildMigration(b: FileBuilder, options: BuildMigrationOptions): Promise<void> {
  const actions = await generateMigrationActions(options);
  writeActionsToBuilder(b, actions);
}

export async function generateMigrationActions(options: BuildMigrationOptions): Promise<MigrationAction[]> {
  const ctx: GenerateActionsContext = {
    postDeployAction: (action, description) => {
      if (options.skipPostDeployActions) {
        console.log(`Skipping post-deploy migration for: ${description}`);
        return;
      }

      if (!options.allowPostDeployActions) {
        throw new Error(`Post-deploy migration required for: ${description}`);
      }

      action();
    },
  };
  const startDefinition = await buildStartDefinition(options);
  const targetDefinition = buildTargetDefinition();
  const actions: MigrationAction[] = [];

  for (const targetFunction of targetDefinition.functions) {
    const startFunction = startDefinition.functions.find((f) => f.name === targetFunction.name);
    if (!startFunction) {
      actions.push({
        type: 'CREATE_FUNCTION',
        name: targetFunction.name,
        createQuery: targetFunction.createQuery,
      });
    }
  }

  for (const targetTable of targetDefinition.tables) {
    const startTable = startDefinition.tables.find((t) => t.name === targetTable.name);
    if (!startTable) {
      actions.push({ type: 'CREATE_TABLE', definition: targetTable });
    } else {
      actions.push(...generateColumnsActions(ctx, startTable, targetTable));
      actions.push(...generateIndexesActions(ctx, startTable, targetTable, options));
    }
  }

  if (options.analyzeResourceTables) {
    for (const [resourceType, fhirType] of Object.entries(getAllDataTypes())) {
      if (!isResourceTypeSchema(fhirType)) {
        continue;
      }
      actions.push({ type: 'ANALYZE_TABLE', tableName: resourceType });
    }
  }
  return actions;
}

async function buildStartDefinition(options: BuildMigrationOptions): Promise<SchemaDefinition> {
  const db = options.dbClient;

  const functions: SqlFunctionDefinition[] = [];
  for (const func of TargetFunctions) {
    const def = await getFunctionDefinition(db, func.name);
    if (def) {
      functions.push(def);
    }
  }

  const tableNames = await getTableNames(db);
  const tables: TableDefinition[] = [];

  for (const tableName of tableNames) {
    tables.push(await getTableDefinition(db, tableName));
  }

  const unusedParsers = SpecialIndexParsers.filter((p) => !p.usageCount);
  if (unusedParsers.length) {
    throw new Error('Unused special index parsers:\n' + unusedParsers.map((p) => p.toString()).join('\n'));
  }

  return { tables, functions };
}

async function getTableNames(db: Client | Pool | PoolClient): Promise<string[]> {
  const rs = await db.query("SELECT * FROM information_schema.tables WHERE table_schema='public'");
  return rs.rows.map((row) => row.table_name);
}

async function getTableDefinition(db: Client | Pool | PoolClient, name: string): Promise<TableDefinition> {
  return {
    name,
    columns: await getColumns(db, name),
    indexes: await getIndexes(db, name),
  };
}

async function getFunctionDefinition(
  db: Client | Pool | PoolClient,
  name: string
): Promise<SqlFunctionDefinition | undefined> {
  let result: QueryResult<{ pg_get_functiondef: string }>;
  try {
    result = await db.query(`SELECT pg_catalog.pg_get_functiondef('${name}'::regproc::oid);`);
  } catch (_err) {
    return undefined;
  }

  if (result.rows.length === 1) {
    return {
      name,
      createQuery: result.rows[0].pg_get_functiondef,
    };
  }

  if (result.rows.length > 1) {
    throw new Error('Multiple functiondefs found for ' + name);
  }

  return undefined;
}

async function getColumns(db: Client | Pool | PoolClient, tableName: string): Promise<ColumnDefinition[]> {
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

async function getIndexes(db: Client | Pool | PoolClient, tableName: string): Promise<IndexDefinition[]> {
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

export function parseIndexName(indexdef: string): string | undefined {
  return indexdef.match(/INDEX "?([^"]+)"? ON/i)?.[1];
}

function buildTargetDefinition(): SchemaDefinition {
  const result: SchemaDefinition = { tables: [], functions: TargetFunctions };

  for (const [resourceType, typeSchema] of Object.entries(getAllDataTypes())) {
    buildCreateTables(result, resourceType, typeSchema);
  }

  buildAddressTable(result);
  buildContactPointTable(result);
  buildIdentifierTable(result);
  buildHumanNameTable(result);
  buildCodingTable(result);
  buildCodingPropertyTable(result);
  buildDatabaseMigrationTable(result);

  return result;
}

export function buildCreateTables(
  result: SchemaDefinition,
  maybeResourceType: string,
  fhirType: InternalTypeSchema
): void {
  if (!isResourceTypeSchema(fhirType)) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }
  const resourceType = maybeResourceType as ResourceType;

  const tableDefinition: TableDefinition = {
    name: resourceType,
    columns: [
      { name: 'id', type: 'UUID', primaryKey: true, notNull: true },
      { name: 'content', type: 'TEXT', notNull: true },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'deleted', type: 'BOOLEAN', notNull: true, defaultValue: 'false' },
      { name: 'compartments', type: 'UUID[]', notNull: true },
      { name: 'projectId', type: 'UUID' },
      { name: '__version', type: 'INTEGER' },
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
      { columns: ['__version'], indexType: 'btree' },
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
  for (const searchParam of getStandardAndDerivedSearchParameters(resourceType)) {
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

    const legacyColumnImpl = isLegacyTokenColumnSearchParameter(searchParam, resourceType)
      ? getSearchParameterImplementation(resourceType, searchParam, true)
      : undefined;

    for (const column of getSearchParameterColumns(impl, legacyColumnImpl)) {
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

    for (const index of getSearchParameterIndexes(impl, legacyColumnImpl)) {
      const existing = tableDefinition.indexes.find((i) => indexDefinitionsEqual(i, index));
      if (existing) {
        continue;
      }
      tableDefinition.indexes.push(index);
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

function getSearchParameterColumns(
  impl: ColumnSearchParameterImplementation | TokenColumnSearchParameterImplementation,
  legacyColumnImpl?: ColumnSearchParameterImplementation
): ColumnDefinition[] {
  switch (impl.searchStrategy) {
    case 'token-column': {
      if (impl.type !== SearchParameterType.TEXT) {
        throw new Error('Expected SearchParameterDetails.type to be TEXT but got ' + impl.type);
      }
      const columns = [
        { name: impl.systemColumnName, type: 'TEXT[]' },
        { name: impl.valueColumnName, type: 'TEXT[]' },
        { name: impl.systemValueColumnName, type: 'TEXT[]' },
        { name: impl.textSearchColumnName, type: 'TEXT[]' },
        { name: impl.sortColumnName, type: 'TEXT' },

        { name: impl.legacyColumnName, type: 'TEXT[]' },
        { name: impl.legacyTextSearchColumnName, type: 'TEXT[]' },
      ];

      if (legacyColumnImpl) {
        columns.push(getColumnDefinition(legacyColumnImpl.columnName, legacyColumnImpl));
      }
      return columns;
    }
    case 'column':
      return [getColumnDefinition(impl.columnName, impl)];
    default:
      throw new Error('Unexpected searchStrategy: ' + (impl as SearchParameterImplementation).searchStrategy);
  }
}

function getSearchParameterIndexes(
  impl: ColumnSearchParameterImplementation | TokenColumnSearchParameterImplementation,
  legacyColumnImpl?: ColumnSearchParameterImplementation
): IndexDefinition[] {
  switch (impl.searchStrategy) {
    case 'token-column': {
      const columns: IndexDefinition[] = [
        { columns: [impl.systemColumnName], indexType: 'gin' },
        { columns: [impl.valueColumnName], indexType: 'gin' },
        { columns: [impl.systemValueColumnName], indexType: 'gin' },
        {
          columns: [
            {
              expression: `${TokenArrayToTextFn.name}(${escapeIdentifier(impl.textSearchColumnName)}) gin_trgm_ops`,
              name: impl.textSearchColumnName + 'Trgm',
            },
          ],
          indexType: 'gin',
        },
        { columns: [impl.legacyColumnName], indexType: 'gin' },
        {
          columns: [
            {
              expression: `${TokenArrayToTextFn.name}(${escapeIdentifier(impl.legacyTextSearchColumnName)}) gin_trgm_ops`,
              name: impl.legacyColumnName + 'Trgm',
            },
          ],
          indexType: 'gin',
        },
      ];

      if (legacyColumnImpl) {
        columns.push({ columns: [legacyColumnImpl.columnName], indexType: legacyColumnImpl.array ? 'gin' : 'btree' });
      }
      return columns;
    }
    case 'column':
      return [{ columns: [impl.columnName], indexType: impl.array ? 'gin' : 'btree' }];
    default:
      throw new Error('Unexpected searchStrategy: ' + (impl as SearchParameterImplementation).searchStrategy);
  }
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

  if (impl.searchStrategy === 'token-column') {
    if (baseColumnType.toLocaleUpperCase() !== 'TEXT') {
      throw new Error('Token columns must have TEXT column type');
    }

    return { name, type: 'TEXT[]' };
  }

  return { name, type: impl.array ? baseColumnType + '[]' : baseColumnType, notNull: false };
}

function buildSearchIndexes(result: TableDefinition, resourceType: ResourceType): void {
  if (resourceType === 'UserConfiguration') {
    const nameCol = result.columns.find((c) => c.name === 'name');
    if (!nameCol) {
      throw new Error('Could not find UserConfiguration.name column');
    }
    nameCol.defaultValue = "''::text";
  }

  if (resourceType === 'User') {
    result.indexes.push({ columns: ['project', 'email'], indexType: 'btree', unique: true });
    result.indexes.push({ columns: ['project', 'externalId'], indexType: 'btree', unique: true });
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
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, given)", name: 'given' }],
        indexType: 'gin',
        unique: false,
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: "to_tsvector('simple'::regconfig, family)", name: 'family' }],
        indexType: 'gin',
        unique: false,
        indexNameSuffix: 'idx_tsv',
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

function buildCodingTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'Coding',
    columns: [
      { name: 'id', type: 'BIGINT', notNull: true, defaultValue: 'nextval(\'"Coding_id_seq"\'::regclass)' },
      { name: 'system', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
      { name: 'display', type: 'TEXT' },
      { name: 'isSynonym', type: 'BOOLEAN' },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree', unique: true },
      { columns: ['system', 'code'], indexType: 'btree', unique: true, include: ['id'] },
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
    indexes: [
      { columns: ['coding', 'property', 'target', 'value'], indexType: 'btree', unique: true },
      { columns: ['target', 'property', 'coding'], indexType: 'btree', unique: false, where: 'target IS NOT NULL' },
      { columns: ['coding'], indexType: 'btree', unique: false },
    ],
  });
}

function buildDatabaseMigrationTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'DatabaseMigration',
    columns: [
      { name: 'id', type: 'INTEGER', notNull: true, primaryKey: true },
      { name: 'version', type: 'INTEGER', notNull: true },
      { name: 'dataVersion', type: 'INTEGER', notNull: true },
      { name: 'firstBoot', type: 'BOOLEAN', notNull: true, defaultValue: 'false' },
    ],
    indexes: [{ columns: ['id'], indexType: 'btree', unique: true }],
  });
}

export async function executeMigrationActions(
  client: Client | Pool | PoolClient,
  actions: MigrationAction[]
): Promise<MigrationActionResult[]> {
  const results: MigrationActionResult[] = [];
  for (const action of actions) {
    switch (action.type) {
      case 'ANALYZE_TABLE':
        await fns.analyzeTable(client, results, action.tableName);
        break;
      case 'CREATE_FUNCTION': {
        await fns.query(client, results, action.createQuery);
        break;
      }
      case 'CREATE_TABLE': {
        const queries = getCreateTableQueries(action.definition);
        for (const query of queries) {
          await fns.query(client, results, query);
        }
        break;
      }
      case 'ADD_COLUMN': {
        const query = getAddColumnQuery(action.tableName, action.columnDefinition);
        await fns.query(client, results, query);
        break;
      }
      case 'DROP_COLUMN': {
        const query = getDropColumnQuery(action.tableName, action.columnName);
        await fns.query(client, results, query);
        break;
      }
      case 'ALTER_COLUMN_SET_DEFAULT': {
        const query = getAlterColumnSetDefaultQuery(action.tableName, action.columnName, action.defaultValue);
        await fns.query(client, results, query);
        break;
      }
      case 'ALTER_COLUMN_DROP_DEFAULT': {
        const query = getAlterColumnDropDefaultQuery(action.tableName, action.columnName);
        await fns.query(client, results, query);
        break;
      }
      case 'ALTER_COLUMN_UPDATE_NOT_NULL': {
        const query = getAlterColumnUpdateNotNullQuery(action.tableName, action.columnName, action.notNull);
        await fns.query(client, results, query);
        break;
      }
      case 'ALTER_COLUMN_TYPE': {
        const query = getAlterColumnTypeQuery(action.tableName, action.columnName, action.columnType);
        await fns.query(client, results, query);
        break;
      }
      case 'CREATE_INDEX': {
        await fns.idempotentCreateIndex(client, results, action.indexName, action.createIndexSql);
        break;
      }
      case 'DROP_INDEX': {
        await fns.query(client, results, getDropIndexQuery(action.indexName));
        break;
      }
    }
  }
  return results;
}

function writeActionsToBuilder(b: FileBuilder, actions: MigrationAction[]): void {
  b.append("import { PoolClient } from 'pg';");
  b.append("import * as fns from '../migrate-functions';");
  b.newLine();
  b.append('// prettier-ignore'); // To prevent prettier from reformatting the SQL statements
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;
  b.append('const actions: { name: string; durationMs: number }[] = []');

  for (const action of actions) {
    switch (action.type) {
      case 'ANALYZE_TABLE':
        b.appendNoWrap(`await fns.analyzeTable(client, actions, '${action.tableName}');`);
        break;
      case 'CREATE_FUNCTION': {
        b.appendNoWrap(`await fns.query(client, actions, \`${escapeUnicode(action.createQuery)}\`);`);
        break;
      }
      case 'CREATE_TABLE': {
        const queries = getCreateTableQueries(action.definition);
        for (const query of queries) {
          b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        }
        break;
      }
      case 'ADD_COLUMN': {
        const query = getAddColumnQuery(action.tableName, action.columnDefinition);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'DROP_COLUMN': {
        const query = getDropColumnQuery(action.tableName, action.columnName);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_SET_DEFAULT': {
        const query = getAlterColumnSetDefaultQuery(action.tableName, action.columnName, action.defaultValue);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_DROP_DEFAULT': {
        const query = getAlterColumnDropDefaultQuery(action.tableName, action.columnName);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_UPDATE_NOT_NULL': {
        const query = getAlterColumnUpdateNotNullQuery(action.tableName, action.columnName, action.notNull);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_TYPE': {
        const query = getAlterColumnTypeQuery(action.tableName, action.columnName, action.columnType);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      case 'CREATE_INDEX': {
        b.appendNoWrap(
          `await fns.idempotentCreateIndex(client, actions, '${action.indexName}', \`${action.createIndexSql}\`);`
        );
        break;
      }
      case 'DROP_INDEX': {
        const query = getDropIndexQuery(action.indexName);
        b.appendNoWrap(`await fns.query(client, actions, \`${query}\`);`);
        break;
      }
      default: {
        action satisfies never;
        throw new Error('Unsupported action type', { cause: action });
      }
    }
  }

  b.indentCount--;
  b.append('}');
}

function generateColumnsActions(
  ctx: GenerateActionsContext,
  startTable: TableDefinition,
  targetTable: TableDefinition
): MigrationAction[] {
  const actions: MigrationAction[] = [];
  for (const targetColumn of targetTable.columns) {
    const startColumn = startTable.columns.find((c) => c.name === targetColumn.name);
    if (!startColumn) {
      actions.push({ type: 'ADD_COLUMN', tableName: targetTable.name, columnDefinition: targetColumn });
    } else if (!columnDefinitionsEqual(startColumn, targetColumn)) {
      actions.push(...generateAlterColumnActions(ctx, targetTable, startColumn, targetColumn));
    }
  }
  for (const startColumn of startTable.columns) {
    if (!targetTable.columns.some((c) => c.name === startColumn.name)) {
      actions.push({ type: 'DROP_COLUMN', tableName: targetTable.name, columnName: startColumn.name });
    }
  }
  return actions;
}

type GenerateActionsContext = {
  /**
   * Guard function that should be called before writes of post-deploy actions.
   * If `--skipPostDeploy` is provided, the action is skipped.
   * If `--allowPostDeploy` is not provided, the action is performed.
   * Otherwise, an error is thrown to halt the migration generation process.
   * @param action - The post-deploy action to perform if the guard passes.
   * @param description - A human-readable description of the action that is being checked
   */
  postDeployAction: (action: () => void, description: string) => void;
};

function generateAlterColumnActions(
  ctx: GenerateActionsContext,
  tableDefinition: TableDefinition,
  startDef: ColumnDefinition,
  targetDef: ColumnDefinition
): MigrationAction[] {
  const actions: MigrationAction[] = [];
  if (startDef.defaultValue !== targetDef.defaultValue) {
    ctx.postDeployAction(() => {
      if (targetDef.defaultValue) {
        actions.push({
          type: 'ALTER_COLUMN_SET_DEFAULT',
          tableName: tableDefinition.name,
          columnName: targetDef.name,
          defaultValue: targetDef.defaultValue,
        });
      } else {
        actions.push({
          type: 'ALTER_COLUMN_DROP_DEFAULT',
          tableName: tableDefinition.name,
          columnName: targetDef.name,
        });
      }
    }, `Change default value of ${tableDefinition.name}.${targetDef.name}`);
  }

  if (startDef.notNull !== targetDef.notNull) {
    ctx.postDeployAction(() => {
      actions.push({
        type: 'ALTER_COLUMN_UPDATE_NOT_NULL',
        tableName: tableDefinition.name,
        columnName: targetDef.name,
        notNull: targetDef.notNull ?? false,
      });
    }, `Change NOT NULL of ${tableDefinition.name}.${targetDef.name}`);
  }

  if (startDef.type !== targetDef.type) {
    ctx.postDeployAction(() => {
      actions.push({
        type: 'ALTER_COLUMN_TYPE',
        tableName: tableDefinition.name,
        columnName: targetDef.name,
        columnType: targetDef.type,
      });
    }, `Change type of ${tableDefinition.name}.${targetDef.name}`);
  }
  return actions;
}

function getCreateTableQueries(tableDef: TableDefinition): string[] {
  const queries: string[] = [];
  const createTableParts = [`CREATE TABLE IF NOT EXISTS "${tableDef.name}" (`];
  for (let i = 0; i < tableDef.columns.length; i++) {
    const column = tableDef.columns[i];
    createTableParts.push(`  "${column.name}" ${column.type}` + (i !== tableDef.columns.length - 1 ? ',' : ''));
  }
  createTableParts.push(')');
  queries.push(createTableParts.join('\n'));

  if (tableDef.compositePrimaryKey !== undefined && tableDef.compositePrimaryKey.length > 0) {
    queries.push(
      `ALTER TABLE IF EXISTS "${tableDef.name}" ADD PRIMARY KEY (${tableDef.compositePrimaryKey.map((c) => `"${c}"`).join(', ')})`
    );
  }

  for (const indexDef of tableDef.indexes) {
    const indexName = getIndexName(tableDef.name, indexDef);
    const createIndexSql = buildIndexSql(tableDef.name, indexName, indexDef);
    queries.push(createIndexSql);
  }

  return queries;
}

function getAddColumnQuery(tableName: string, columnDefinition: ColumnDefinition): string {
  const { name, type, notNull, primaryKey, defaultValue } = columnDefinition;
  return `ALTER TABLE IF EXISTS "${tableName}" ADD COLUMN IF NOT EXISTS "${name}" ${type}${notNull ? ' NOT NULL' : ''}${primaryKey ? ' PRIMARY KEY' : ''}${defaultValue ? ' DEFAULT ' + defaultValue : ''}`;
}

function getDropColumnQuery(tableName: string, columnName: string): string {
  return `ALTER TABLE IF EXISTS "${tableName}" DROP COLUMN IF EXISTS "${columnName}"`;
}

function getAlterColumnSetDefaultQuery(tableName: string, columnName: string, defaultValue: string): string {
  return `ALTER TABLE IF EXISTS "${tableName}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue}`;
}

function getAlterColumnDropDefaultQuery(tableName: string, columnName: string): string {
  return `ALTER TABLE IF EXISTS "${tableName}" ALTER COLUMN "${columnName}" DROP DEFAULT`;
}

function getAlterColumnUpdateNotNullQuery(tableName: string, columnName: string, notNull: boolean): string {
  return `ALTER TABLE IF EXISTS "${tableName}" ALTER COLUMN "${columnName}" ${notNull ? 'SET' : 'DROP'} NOT NULL`;
}

function getAlterColumnTypeQuery(tableName: string, columnName: string, columnType: string): string {
  return `ALTER TABLE IF EXISTS "${tableName}" ALTER COLUMN "${columnName}" TYPE ${columnType}`;
}

function getDropIndexQuery(indexName: string): string {
  return `DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`;
}

function generateIndexesActions(
  ctx: GenerateActionsContext,
  startTable: TableDefinition,
  targetTable: TableDefinition,
  options: BuildMigrationOptions
): MigrationAction[] {
  const actions: MigrationAction[] = [];

  const matchedIndexes = new Set<IndexDefinition>();
  const seenIndexNames = new Set<string>();

  for (const targetIndex of targetTable.indexes) {
    const indexName = getIndexName(targetTable.name, targetIndex);
    if (seenIndexNames.has(indexName)) {
      throw new Error('Duplicate index name: ' + indexName, { cause: targetIndex });
    }
    seenIndexNames.add(indexName);

    const startIndex = startTable.indexes.find((i) => indexDefinitionsEqual(i, targetIndex));
    if (!startIndex) {
      ctx.postDeployAction(
        () => {
          const createIndexSql = buildIndexSql(targetTable.name, indexName, targetIndex);
          actions.push({ type: 'CREATE_INDEX', indexName, createIndexSql });
        },
        `CREATE INDEX ${escapeIdentifier(indexName)} ON ${escapeIdentifier(targetTable.name)} ...`
      );
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
        const indexName = parseIndexName(startIndex.indexdef ?? '');
        if (!indexName) {
          throw new Error('Could not extract index name from ' + startIndex.indexdef, { cause: startIndex });
        }
        actions.push({ type: 'DROP_INDEX', indexName });
      }
    }
  }
  return actions;
}

function getIndexName(tableName: string, index: IndexDefinition): string {
  let indexName = tableName;

  indexName = applyAbbreviations(indexName, TableAbbrieviations) + '_';

  indexName += index.columns
    .map((c) => (typeof c === 'string' ? c : c.name))
    .map((c) => applyAbbreviations(c, ColumnNameAbbreviations))
    .join('_');
  indexName += '_' + (index.indexNameSuffix ?? 'idx');

  if (indexName.length > 63) {
    throw new Error('Index name too long: ' + indexName);
  }

  return indexName;
}

function buildIndexSql(tableName: string, indexName: string, index: IndexDefinition): string {
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

  if (index.include) {
    result += ' INCLUDE (';
    result += index.include.map((c) => `"${c}"`).join(', ');
    result += ')';
  }

  if (index.where) {
    result += ' WHERE (';
    result += index.where;
    result += ')';
  }

  return result;
}

function getMigrationFilenames(): string[] {
  return readdirSync(SCHEMA_DIR).filter((filename) => /^v\d+\.ts$/.test(filename));
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
  const b = new FileBuilder();
  const filenamesWithoutExt = getMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => a - b)
    .map((version) => `v${version}`);
  for (const filename of filenamesWithoutExt) {
    b.append(`export * as ${filename} from './${filename}';`);
    if (filename === 'v9') {
      b.append('/* CAUTION: LOAD-BEARING COMMENT */');
      b.append(
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */'
      );
    }
  }
  writeFileSync(`${SCHEMA_DIR}/index.ts`, b.toString(), { flag: 'w' });
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

export function columnDefinitionsEqual(a: ColumnDefinition, b: ColumnDefinition): boolean {
  // Populate optional fields with default values before comparing
  for (const def of [a, b]) {
    def.defaultValue ??= undefined;
    def.notNull ??= false;
    def.primaryKey ??= false;
  }

  // deepEquals has FHIR-specific logic, but ColumnDefinition is simple enough that it works fine
  return deepEquals(a, b);
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

  // Shorten _References suffix to _Refs
  if (result.endsWith('_References')) {
    result = result.slice(0, -'References'.length) + 'Refs';
  }

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

  // Expand _Refs suffix back to _References
  if (result.endsWith('_Refs')) {
    result = result.slice(0, -'Refs'.length) + 'References';
  }

  return result;
}

if (require.main === module) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}

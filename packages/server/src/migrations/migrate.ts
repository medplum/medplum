// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FileBuilder } from '@medplum/core';
import {
  deepClone,
  deepEquals,
  getResourceTypes,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  isPopulated,
  SearchParameterType,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { escapeIdentifier } from 'pg';
import { systemResourceProjectId } from '../constants';
import { getStandardAndDerivedSearchParameters } from '../fhir/lookups/util';
import type { SearchParameterImplementation } from '../fhir/searchparameter';
import { getSearchParameterImplementation } from '../fhir/searchparameter';
import type { SqlFunctionDefinition } from '../fhir/sql';
import { TokenArrayToTextFn } from '../fhir/sql';
import * as fns from './migrate-functions';
import {
  ColumnNameAbbreviations,
  escapeMixedCaseIdentifier,
  escapeUnicode,
  getColumns,
  getFunctionDefinition,
  parseIndexDefinition,
  TableNameAbbreviations,
  tsVectorExpression,
} from './migrate-utils';
import type {
  CheckConstraintDefinition,
  ColumnDefinition,
  DbClient,
  IndexDefinition,
  IndexType,
  MigrationAction,
  MigrationActionResult,
  SchemaDefinition,
  TableDefinition,
} from './types';
import { SerialColumnTypes } from './types';

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

export type BuildMigrationOptions = {
  dbClient: DbClient;
  dropUnmatchedIndexes?: boolean;
  skipPostDeployActions?: boolean;
  allowPostDeployActions?: boolean;
  analyzeResourceTables?: boolean;
  writeSchema?: boolean;
  skipMigration?: boolean;
};

export async function buildMigration(b: FileBuilder, options: BuildMigrationOptions): Promise<void> {
  const actions = await generateMigrationActions(options);
  writeActionsToBuilder(b, actions);
}

export function buildSchema(builder: FileBuilder): void {
  const targetDefinition = buildTargetDefinition();

  const actions: MigrationAction[] = [];

  for (const targetFunction of targetDefinition.functions) {
    actions.push({
      type: 'CREATE_FUNCTION',
      name: targetFunction.name,
      createQuery: targetFunction.createQuery,
    });
  }

  for (const targetTable of targetDefinition.tables) {
    actions.push({ type: 'CREATE_TABLE', definition: targetTable });
  }
  writeSchema(builder, actions);
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

  const matchedStartTables = new Set<TableDefinition>();
  for (const targetTable of targetDefinition.tables) {
    const startTable = startDefinition.tables.find((t) => t.name === targetTable.name);
    if (startTable) {
      matchedStartTables.add(startTable);
      actions.push(
        ...generateColumnsActions(ctx, startTable, targetTable),
        ...generateIndexesActions(ctx, startTable, targetTable, options),
        ...generateConstraintsActions(ctx, startTable, targetTable)
      );
    } else {
      actions.push({ type: 'CREATE_TABLE', definition: targetTable });
    }
  }

  for (const startTable of startDefinition.tables) {
    if (!matchedStartTables.has(startTable)) {
      ctx.postDeployAction(
        () => {
          actions.push({ type: 'DROP_TABLE', tableName: startTable.name });
        },
        `DROP TABLE ${escapeMixedCaseIdentifier(startTable.name)}`
      );
    }
  }

  if (options.analyzeResourceTables) {
    for (const resourceType of getResourceTypes()) {
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

  return { tables, functions };
}

async function getTableNames(db: DbClient): Promise<string[]> {
  const rs = await db.query("SELECT * FROM information_schema.tables WHERE table_schema='public'");
  return rs.rows.map((row) => row.table_name);
}

async function getTableDefinition(db: DbClient, name: string): Promise<TableDefinition> {
  return {
    name,
    columns: await getColumns(db, name),
    indexes: await getIndexes(db, name),
    constraints: await getCheckConstraints(db, name),
  };
}

async function getIndexes(db: DbClient, tableName: string): Promise<IndexDefinition[]> {
  const rs = await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1`, [tableName]);
  return rs.rows.map((row) => parseIndexDefinition(row.indexdef));
}

export function parseIndexName(indexdef: string): string | undefined {
  return /INDEX "?([^"]+)"? ON/i.exec(indexdef)?.[1];
}

export async function getCheckConstraints(
  db: DbClient,
  tableName: string
): Promise<(CheckConstraintDefinition & { valid: boolean })[]> {
  const rs = await db.query<{
    table_name: string;
    conname: string;
    contype: string;
    convalidated: boolean;
    condef: string;
  }>(
    `SELECT conrelid::regclass AS table_name, conname, contype, convalidated, pg_get_constraintdef(oid, TRUE) as condef
FROM pg_catalog.pg_constraint
WHERE connamespace = 'public'::regnamespace AND conrelid IN($1::regclass) AND contype = 'c'`,
    [escapeIdentifier(tableName)]
  );

  const cds: (CheckConstraintDefinition & { valid: boolean })[] = [];
  for (const row of rs.rows) {
    if (row.contype === 'c') {
      const expressionMatch = /CHECK \((.*)\)/.exec(row.condef);
      if (!expressionMatch) {
        throw new Error('Could not parse check constraint expression from ' + row.condef);
      }
      cds.push({
        name: row.conname,
        type: 'check',
        expression: expressionMatch[1],
        valid: row.convalidated,
      });
    }
  }
  return cds;
}

function buildTargetDefinition(): SchemaDefinition {
  const result: SchemaDefinition = { tables: [], functions: TargetFunctions };

  for (const resourceType of getResourceTypes()) {
    buildCreateTables(result, resourceType);
  }

  buildAddressTable(result);
  buildContactPointTable(result);
  buildIdentifierTable(result);
  buildHumanNameTable(result);
  buildCodingTable(result);
  buildCodingPropertyTable(result);
  buildCodeSystemPropertyTable(result);
  buildConceptMappingTable(result);
  buildCodingSystemTable(result);
  buildConceptMappingAttributeTable(result);
  buildDatabaseMigrationTable(result);

  return result;
}

export function buildCreateTables(result: SchemaDefinition, resourceType: ResourceType): void {
  const tableDefinition: TableDefinition = {
    name: resourceType,
    columns: [
      { name: 'id', type: 'UUID', primaryKey: true, notNull: true },
      { name: 'content', type: 'TEXT', notNull: true },
      { name: 'lastUpdated', type: 'TIMESTAMPTZ', notNull: true },
      { name: 'deleted', type: 'BOOLEAN', notNull: true, defaultValue: 'false' },
      { name: 'projectId', type: 'UUID', notNull: true },
      { name: '__version', type: 'INTEGER', notNull: true },
      { name: '_source', type: 'TEXT' },
      { name: '_profile', type: 'TEXT[]' },
    ],
    indexes: [
      { columns: ['lastUpdated'], indexType: 'btree' },
      { columns: ['projectId', 'lastUpdated'], indexType: 'btree' },
      { columns: ['projectId'], indexType: 'btree' },
      { columns: ['_source'], indexType: 'btree' },
      { columns: ['_profile'], indexType: 'gin' },
      { columns: ['__version'], indexType: 'btree' },
      // This index is used to efficiently paginate through resources during reindexing
      {
        columns: ['lastUpdated', '__version'],
        where: 'deleted = false',
        indexType: 'btree',
        indexNameOverride: `${resourceType}_reindex_idx`,
      },
    ],
  };

  if (resourceType !== 'Binary') {
    tableDefinition.columns.push({ name: 'compartments', type: 'UUID[]', notNull: true });
    tableDefinition.indexes.push({ columns: ['compartments'], indexType: 'gin' });
  }

  if (resourceType === 'Project') {
    tableDefinition.constraints = tableDefinition.constraints ?? [];
    tableDefinition.constraints.push({
      name: 'reserved_project_id_check',
      type: 'check',
      expression: `id <> '${systemResourceProjectId}'::uuid`,
    });
  }

  buildSearchColumns(tableDefinition, resourceType);
  buildSearchIndexes(tableDefinition, resourceType);
  result.tables.push(
    tableDefinition,
    {
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
    },
    {
      name: resourceType + '_References',
      columns: [
        { name: 'resourceId', type: 'UUID', notNull: true },
        { name: 'targetId', type: 'UUID', notNull: true },
        { name: 'code', type: 'TEXT', notNull: true },
      ],
      compositePrimaryKey: ['resourceId', 'targetId', 'code'],
      indexes: [{ columns: ['targetId', 'code'], indexType: 'btree', include: ['resourceId'] }],
    }
  );
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
    for (const column of getSearchParameterColumns(impl)) {
      const existing = tableDefinition.columns.find((c) => c.name === column.name);
      if (existing) {
        if (!columnDefinitionsEqual(tableDefinition, existing, column)) {
          throw new Error(
            `Search Parameter ${searchParam.id ?? searchParam.code} attempting to define the same column on ${tableDefinition.name} with conflicting types: ${existing.type} vs ${column.type}`
          );
        }
        continue;
      }
      tableDefinition.columns.push(column);
    }

    for (const index of getSearchParameterIndexes(searchParam, impl)) {
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

function getSearchParameterColumns(impl: SearchParameterImplementation): ColumnDefinition[] {
  switch (impl.searchStrategy) {
    case 'token-column': {
      if (impl.type !== SearchParameterType.TEXT) {
        throw new Error('Expected SearchParameterDetails.type to be TEXT but got ' + impl.type);
      }
      const columns = [
        { name: impl.tokenColumnName, type: 'UUID[]' },
        { name: impl.textSearchColumnName, type: 'TEXT[]' },
        { name: impl.sortColumnName, type: 'TEXT' },
      ];

      return columns;
    }
    case 'column':
      return [getColumnDefinition(impl.columnName, impl)];
    case 'lookup-table': {
      if (impl.sortColumnName) {
        return [{ name: impl.sortColumnName, type: 'TEXT' }];
      }
      return [];
    }
    default:
      throw new Error('Unexpected searchStrategy: ' + (impl as SearchParameterImplementation).searchStrategy);
  }
}

function getSearchParameterIndexes(
  searchParam: SearchParameter,
  impl: SearchParameterImplementation
): IndexDefinition[] {
  switch (impl.searchStrategy) {
    case 'token-column': {
      const indexes: IndexDefinition[] = [
        { columns: [impl.tokenColumnName], indexType: 'gin' },
        {
          columns: [
            {
              expression: `${TokenArrayToTextFn.name}(${escapeIdentifier(impl.textSearchColumnName)}) gin_trgm_ops`,
              name: impl.textSearchColumnName + 'Trgm',
            },
          ],
          indexType: 'gin',
        },
      ];

      return indexes;
    }
    case 'column': {
      const indexes: IndexDefinition[] = [{ columns: [impl.columnName], indexType: impl.array ? 'gin' : 'btree' }];
      if (!impl.array && (searchParam.code === 'date' || searchParam.code === 'sent')) {
        indexes.push({ columns: ['projectId', impl.columnName], indexType: 'btree' });
      }
      return indexes;
    }
    case 'lookup-table': {
      if (impl.sortColumnName) {
        return [{ columns: [impl.sortColumnName], indexType: 'btree' }];
      }
      return [];
    }
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
    result.indexes.push(
      { columns: ['project', 'email'], indexType: 'btree', unique: true },
      { columns: ['project', 'externalId'], indexType: 'btree', unique: true }
    );
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

    result.indexes.push(
      {
        columns: ['project', 'externalId'],
        indexType: 'btree',
        unique: true,
      },
      { columns: ['project', 'userName'], indexType: 'btree', unique: true }
    );
  }
}

function buildAddressTable(result: SchemaDefinition): void {
  buildLookupTable(
    result,
    'Address',
    ['address', 'city', 'country', 'postalCode', 'state', 'use'],
    [
      {
        columns: [{ expression: tsVectorExpression('simple', 'address'), name: 'address' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'postalCode'), name: 'postalCode' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'city'), name: 'city' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'use'), name: 'use' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'country'), name: 'country' }],
        indexType: 'gin',
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'state'), name: 'state' }],
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
        columns: [{ expression: 'name gin_trgm_ops', name: 'nameTrgm' }],
        indexType: 'gin',
      },
      {
        columns: [{ expression: 'given gin_trgm_ops', name: 'givenTrgm' }],
        indexType: 'gin',
      },
      {
        columns: [{ expression: 'family gin_trgm_ops', name: 'familyTrgm' }],
        indexType: 'gin',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'name'), name: 'name' }],
        indexType: 'gin',
        unique: false,
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'given'), name: 'given' }],
        indexType: 'gin',
        unique: false,
        indexNameSuffix: 'idx_tsv',
      },
      {
        columns: [{ expression: tsVectorExpression('simple', 'family'), name: 'family' }],
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
      {
        name: 'id',
        type: 'BIGSERIAL',
        primaryKey: true,
      },
      { name: 'system', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
      { name: 'display', type: 'TEXT' },
      { name: 'isSynonym', type: 'BOOLEAN', notNull: true },
      { name: 'synonymOf', type: 'BIGINT' },
    ],
    indexes: [
      { columns: ['id'], indexType: 'btree', unique: true },
      {
        columns: ['system', 'code'],
        indexType: 'btree',
        unique: true,
        include: ['id'],
        where: `"synonymOf" IS NULL`,
        indexNameSuffix: 'primary_idx',
      },
      {
        columns: [
          'system',
          'code',
          'display',
          { expression: `COALESCE("synonymOf", ('-1'::integer)::bigint)`, name: 'synonymOf' },
        ],
        indexType: 'btree',
        unique: true,
      },
      { columns: ['system', { expression: 'display gin_trgm_ops', name: 'displayTrgm' }], indexType: 'gin' },
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
      { name: 'value', type: 'TEXT', notNull: true },
    ],
    indexes: [
      { columns: ['target', 'property', 'coding'], indexType: 'btree', unique: false, where: 'target IS NOT NULL' },
      { columns: ['coding', 'property'], indexType: 'btree', unique: false, indexNameSuffix: '_idx' },
      {
        columns: ['property', 'value', 'coding', 'target'],
        indexType: 'btree',
        unique: true,
        indexNameSuffix: 'full_idx',
      },
    ],
  });
}

function buildCodeSystemPropertyTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'CodeSystem_Property',
    columns: [
      {
        name: 'id',
        type: 'BIGSERIAL',
        primaryKey: true,
      },
      { name: 'system', type: 'UUID', notNull: true },
      { name: 'code', type: 'TEXT', notNull: true },
      { name: 'type', type: 'TEXT', notNull: true },
      { name: 'uri', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
    ],
    indexes: [{ columns: ['system', 'code'], indexType: 'btree', unique: true, include: ['id'] }],
  });
}

function buildConceptMappingTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'ConceptMapping',
    columns: [
      { name: 'id', type: 'BIGINT', primaryKey: true, identity: 'ALWAYS' },
      { name: 'conceptMap', type: 'UUID', notNull: true },
      { name: 'sourceSystem', type: 'BIGINT', notNull: true },
      { name: 'sourceCode', type: 'TEXT', notNull: true },
      { name: 'targetSystem', type: 'BIGINT', notNull: true },
      { name: 'targetCode', type: 'TEXT', notNull: true },
      { name: 'relationship', type: 'TEXT' },
      { name: 'sourceDisplay', type: 'TEXT' },
      { name: 'targetDisplay', type: 'TEXT' },
      { name: 'comment', type: 'TEXT' },
    ],
    indexes: [
      {
        indexNameOverride: 'ConceptMapping_map_source_target_idx',
        indexType: 'btree',
        columns: ['conceptMap', 'sourceSystem', 'sourceCode', 'targetSystem', 'targetCode'],
        unique: true,
      },
      {
        indexNameOverride: 'ConceptMapping_map_reverse_idx',
        indexType: 'btree',
        columns: ['conceptMap', 'targetSystem', 'targetCode', 'sourceSystem'],
      },
    ],
  });
}

function buildCodingSystemTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'CodingSystem',
    columns: [
      { name: 'id', type: 'BIGINT', primaryKey: true, identity: 'ALWAYS' },
      { name: 'system', type: 'TEXT', notNull: true },
    ],
    indexes: [{ columns: ['system'], indexType: 'btree', unique: true, include: ['id'] }],
  });
}

function buildConceptMappingAttributeTable(result: SchemaDefinition): void {
  result.tables.push({
    name: 'ConceptMapping_Attribute',
    columns: [
      { name: 'mapping', type: 'BIGINT', notNull: true },
      { name: 'uri', type: 'TEXT', notNull: true },
      { name: 'type', type: 'TEXT', notNull: true },
      { name: 'value', type: 'TEXT', notNull: true },
      { name: 'kind', type: 'TEXT', notNull: true },
    ],
    compositePrimaryKey: ['mapping', 'uri', 'type', 'value', 'kind'],
    indexes: [],
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
    indexes: [],
  });
}

export async function executeMigrationActions(
  client: DbClient,
  results: MigrationActionResult[],
  actions: MigrationAction[]
): Promise<void> {
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
        const queries = getCreateTableQueries(action.definition, { includeIfExists: true });
        for (const query of queries) {
          await fns.query(client, results, query);
        }
        break;
      }
      case 'DROP_TABLE': {
        const query = getDropTableQuery(action.tableName);
        await fns.query(client, results, query);
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
        if (action.notNull) {
          await fns.nonBlockingAlterColumnNotNull(client, results, action.tableName, action.columnName);
        } else {
          const query = getAlterColumnUpdateNotNullQuery(action.tableName, action.columnName, action.notNull);
          await fns.query(client, results, query);
        }
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
      case 'ADD_CONSTRAINT': {
        await fns.nonBlockingAddCheckConstraint(
          client,
          results,
          action.tableName,
          action.constraintName,
          action.constraintExpression
        );
        break;
      }
    }
  }
}

function writeSchema(b: FileBuilder, actions: MigrationAction[]): void {
  b.append(String.raw`\set ON_ERROR_STOP true`);
  b.append(String.raw`\set QUIET on`);
  b.newLine();

  b.appendNoWrap(String.raw`DROP DATABASE IF EXISTS medplum;`);
  b.appendNoWrap(String.raw`CREATE DATABASE medplum;`);
  b.newLine();

  b.appendNoWrap(String.raw`\c medplum`);
  b.newLine();

  b.append('DO $$');
  b.append('BEGIN');
  b.append(`  IF current_database() NOT IN ('medplum') THEN`);
  b.append(`    RAISE EXCEPTION 'Connected to wrong database: %', current_database();`);
  b.append('  END IF;');
  b.append('END $$;');
  b.newLine();

  b.appendNoWrap(`CREATE EXTENSION IF NOT EXISTS btree_gin;`);
  b.appendNoWrap(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  b.newLine();

  for (const action of actions) {
    switch (action.type) {
      case 'CREATE_FUNCTION': {
        b.appendNoWrap(ensureEndsWithSemicolon(escapeUnicode(action.createQuery)));
        b.newLine();
        break;
      }
      case 'CREATE_TABLE': {
        const queries = getCreateTableQueries(action.definition, { includeIfExists: false });
        for (const query of queries) {
          b.appendNoWrap(ensureEndsWithSemicolon(query));
        }
        b.newLine();
        break;
      }
      default:
        throw new Error('Unsupported writeSchema action type: ' + action.type);
    }
  }
}
function writeActionsToBuilder(b: FileBuilder, actions: MigrationAction[]): void {
  b.append("import { PoolClient } from 'pg';");
  b.append("import * as fns from '../migrate-functions';");
  b.newLine();
  b.append('// prettier-ignore'); // To prevent prettier from reformatting the SQL statements
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;
  b.append('const results: { name: string; durationMs: number }[] = []');

  for (const action of actions) {
    switch (action.type) {
      case 'ANALYZE_TABLE':
        b.appendNoWrap(`await fns.analyzeTable(client, results, '${action.tableName}');`);
        break;
      case 'CREATE_FUNCTION': {
        b.appendNoWrap(`await fns.query(client, results, \`${escapeUnicode(action.createQuery)}\`);`);
        break;
      }
      case 'CREATE_TABLE': {
        const queries = getCreateTableQueries(action.definition, { includeIfExists: true });
        for (const query of queries) {
          b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        }
        break;
      }
      case 'DROP_TABLE': {
        const query = getDropTableQuery(action.tableName);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'ADD_COLUMN': {
        const query = getAddColumnQuery(action.tableName, action.columnDefinition);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'DROP_COLUMN': {
        const query = getDropColumnQuery(action.tableName, action.columnName);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_SET_DEFAULT': {
        const query = getAlterColumnSetDefaultQuery(action.tableName, action.columnName, action.defaultValue);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_DROP_DEFAULT': {
        const query = getAlterColumnDropDefaultQuery(action.tableName, action.columnName);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'ALTER_COLUMN_UPDATE_NOT_NULL': {
        if (action.notNull) {
          b.appendNoWrap(
            `await fns.nonBlockingAlterColumnNotNull(client, results, \`${action.tableName}\`, \`${action.columnName}\`);`
          );
        } else {
          const query = getAlterColumnUpdateNotNullQuery(action.tableName, action.columnName, action.notNull);
          b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        }
        break;
      }
      case 'ALTER_COLUMN_TYPE': {
        const query = getAlterColumnTypeQuery(action.tableName, action.columnName, action.columnType);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'CREATE_INDEX': {
        b.appendNoWrap(
          `await fns.idempotentCreateIndex(client, results, '${action.indexName}', \`${action.createIndexSql}\`);`
        );
        break;
      }
      case 'DROP_INDEX': {
        const query = getDropIndexQuery(action.indexName);
        b.appendNoWrap(`await fns.query(client, results, \`${query}\`);`);
        break;
      }
      case 'ADD_CONSTRAINT': {
        b.appendNoWrap(
          `await fns.nonBlockingAddConstraint(client, results, '${action.tableName}', '${action.constraintName}', \`${action.constraintExpression}\`);`
        );
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
    } else if (!columnDefinitionsEqual(startTable, startColumn, targetColumn)) {
      actions.push(...generateAlterColumnActions(ctx, targetTable, startColumn, targetColumn));
    }
  }
  for (const startColumn of startTable.columns) {
    if (!targetTable.columns.some((c) => c.name === startColumn.name)) {
      ctx.postDeployAction(() => {
        actions.push({ type: 'DROP_COLUMN', tableName: targetTable.name, columnName: startColumn.name });
      }, `Dropping column ${startColumn.name} from ${targetTable.name}`);
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

export function getCreateTableQueries(tableDef: TableDefinition, options: { includeIfExists: boolean }): string[] {
  const queries: string[] = [];
  const createTableLines = [];
  for (const column of tableDef.columns) {
    const parts: string[] = [escapeIdentifier(column.name), column.type];
    if (column.identity) {
      parts.push(`GENERATED ${column.identity} AS IDENTITY`);
    }
    if (column.primaryKey) {
      parts.push('PRIMARY KEY');
    }
    if (column.notNull && !column.primaryKey && !column.identity) {
      parts.push('NOT NULL');
    }
    if (column.defaultValue) {
      if (column.identity) {
        throw new Error(`Cannot set default value on identity column ${tableDef.name}.${column.name}`);
      }
      parts.push(`DEFAULT ${column.defaultValue}`);
    }
    createTableLines.push(`  ${parts.join(' ')}`);
  }

  if (tableDef.compositePrimaryKey !== undefined && tableDef.compositePrimaryKey.length > 0) {
    createTableLines.push(`  PRIMARY KEY (${tableDef.compositePrimaryKey.map(escapeMixedCaseIdentifier).join(', ')})`);
  }

  for (const constraint of tableDef.constraints ?? []) {
    if (constraint.type === 'check') {
      createTableLines.push(`  CONSTRAINT "${constraint.name}" CHECK (${constraint.expression})`);
    } else {
      throw new Error(`Unsupported constraint type: ${constraint.type}`);
    }
  }

  queries.push(
    [
      `CREATE TABLE ${options.includeIfExists ? 'IF NOT EXISTS ' : ''}${escapeIdentifier(tableDef.name)} (`,
      createTableLines.join(',\n'),
      ')',
    ].join('\n')
  );

  for (const indexDef of tableDef.indexes) {
    if (indexDef.primaryKey) {
      continue;
    }
    const indexName = getIndexName(tableDef.name, indexDef);
    const createIndexSql = buildIndexSql(tableDef.name, indexName, indexDef, {
      concurrent: false,
      ifNotExists: options.includeIfExists,
    });
    queries.push(createIndexSql);
  }

  return queries;
}

function getDropTableQuery(tableName: string): string {
  return `DROP TABLE IF EXISTS "${tableName}"`;
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

  const computedIndexes: IndexDefinition[] = [];
  let pkIndex: IndexDefinition | undefined;
  if (targetTable.compositePrimaryKey) {
    pkIndex = {
      columns: targetTable.compositePrimaryKey,
      indexType: 'btree',
      unique: true,
      primaryKey: true,
    };
  } else {
    const pkColumn = targetTable.columns.find((c) => c.primaryKey);
    if (pkColumn) {
      pkIndex = {
        columns: [pkColumn.name],
        indexType: 'btree',
        unique: true,
        primaryKey: true,
      };
    }
  }
  if (pkIndex) {
    computedIndexes.push(pkIndex);
  }
  for (const targetIndex of [...targetTable.indexes, ...computedIndexes]) {
    const indexName = getIndexName(targetTable.name, targetIndex);
    if (seenIndexNames.has(indexName)) {
      throw new Error('Duplicate index name: ' + indexName, { cause: targetIndex });
    }
    seenIndexNames.add(indexName);

    const startIndex = startTable.indexes.find((i) => indexDefinitionsEqual(i, targetIndex));
    if (startIndex) {
      matchedIndexes.add(startIndex);
    } else {
      ctx.postDeployAction(
        () => {
          const createIndexSql = buildIndexSql(targetTable.name, indexName, targetIndex, {
            concurrent: true,
            ifNotExists: true,
          });
          actions.push({ type: 'CREATE_INDEX', indexName, createIndexSql });
        },
        `CREATE INDEX ${escapeIdentifier(indexName)} ON ${escapeIdentifier(targetTable.name)} ...`
      );
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

function generateConstraintsActions(
  ctx: GenerateActionsContext,
  startTable: TableDefinition,
  targetTable: TableDefinition
): MigrationAction[] {
  const actions: MigrationAction[] = [];

  const matchedConstraints = new Set<CheckConstraintDefinition>();
  const seenConstraintNames = new Set<string>();

  for (const targetConstraint of targetTable.constraints ?? []) {
    if (seenConstraintNames.has(targetConstraint.name)) {
      throw new Error('Duplicate constraint name: ' + targetConstraint.name, { cause: targetConstraint });
    }
    seenConstraintNames.add(targetConstraint.name);

    const startConstraint = startTable.constraints?.find((c) => constraintDefinitionsEqual(c, targetConstraint));
    if (startConstraint) {
      matchedConstraints.add(startConstraint);
    } else {
      ctx.postDeployAction(
        () => {
          actions.push({
            type: 'ADD_CONSTRAINT',
            tableName: targetTable.name,
            constraintName: targetConstraint.name,
            constraintExpression: targetConstraint.expression,
          });
        },
        `ADD CONSTRAINT ${escapeIdentifier(targetConstraint.name)} ON ${escapeIdentifier(targetTable.name)} ...`
      );
    }
  }

  for (const startConstraint of startTable.constraints ?? []) {
    if (!matchedConstraints.has(startConstraint)) {
      console.log(
        `[${startTable.name}] Existing constraint should not exist:`,
        startConstraint.expression || JSON.stringify(startConstraint)
      );
    }
  }
  return actions;
}

function getIndexName(tableName: string, index: IndexDefinition): string {
  if (index.indexNameOverride) {
    return index.indexNameOverride;
  }

  if (index.primaryKey) {
    return tableName + '_pkey';
  }

  let indexName = applyAbbreviations(tableName, TableNameAbbreviations) + '_';

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

function buildIndexSql(
  tableName: string,
  indexName: string,
  index: IndexDefinition,
  options: { concurrent: boolean; ifNotExists: boolean }
): string {
  let result = 'CREATE ';

  if (index.unique) {
    result += 'UNIQUE ';
  }

  result += 'INDEX ';

  if (options.concurrent) {
    result += 'CONCURRENTLY ';
  }

  if (options.ifNotExists) {
    result += 'IF NOT EXISTS ';
  }

  result += '"';
  result += indexName;
  result += '" ON "';
  result += tableName;
  result += '" ';

  if (index.indexType !== 'btree') {
    result += 'USING ' + index.indexType + ' ';
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

export function indexDefinitionsEqual(a: IndexDefinition, b: IndexDefinition): boolean {
  const [aPrime, bPrime] = [a, b].map((d) => {
    return {
      ...d,
      unique: (d.primaryKey || d.unique) ?? false,
      // parseIndexDefinition does not include primary key information
      primaryKey: undefined,
      // for expressions, ignore names since those are only used for index name generation
      columns: d.columns.map((c) => (typeof c === 'string' ? c : c.expression)),
      // don't care about these
      indexNameOverride: undefined,
      indexNameSuffix: undefined,
      indexdef: undefined,
    };
  });

  return deepEquals(aPrime, bPrime);
}

/**
 * Translate SERIAL types to INT types based on {@link https://www.postgresql.org/docs/16/datatype-numeric.html#DATATYPE-SERIAL}
 * Translate IDENTITY types to NOT NULL
 *
 * @param tableDef - the table definition
 * @param inputColumnDef - the column definition to desugar
 * @returns the desugared column definition if it was a SERIAL/IDENTITY column, otherwise the original column definition
 */
function desugarColumnDefinition(tableDef: TableDefinition, inputColumnDef: ColumnDefinition): ColumnDefinition {
  if (SerialColumnTypes.has(inputColumnDef.type.toLocaleUpperCase())) {
    const columnDef = deepClone(inputColumnDef);
    columnDef.type = columnDef.type.toLocaleUpperCase().replace('SERIAL', 'INT');
    columnDef.notNull = true;
    const sequenceName = [tableDef.name, columnDef.name, 'seq'].join('_');
    columnDef.defaultValue = `nextval('${escapeIdentifier(sequenceName)}'::regclass)`;
    return columnDef;
  }

  if (inputColumnDef.identity) {
    const columnDef = deepClone(inputColumnDef);
    columnDef.identity = undefined;
    columnDef.notNull = true;
    return columnDef;
  }

  return inputColumnDef;
}

export function columnDefinitionsEqual(table: TableDefinition, a: ColumnDefinition, b: ColumnDefinition): boolean {
  // Populate optional fields with default values before comparing
  for (const def of [a, b]) {
    def.defaultValue ??= undefined;
    def.notNull ??= false;
    def.primaryKey ??= false;
  }

  // deepEquals has FHIR-specific logic, but ColumnDefinition is simple enough that it works fine
  return deepEquals(desugarColumnDefinition(table, a), desugarColumnDefinition(table, b));
}

export function constraintDefinitionsEqual(a: CheckConstraintDefinition, b: CheckConstraintDefinition): boolean {
  return deepEquals({ ...a, valid: undefined }, { ...b, valid: undefined });
}

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

function ensureEndsWithSemicolon(query: string): string {
  if (query.endsWith(';')) {
    return query;
  }
  return query + ';';
}

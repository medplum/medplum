import {
  PropertyType,
  SearchParameterDetails,
  SearchParameterType,
  TypeSchema,
  getSearchParameterDetails,
  globalSchema,
  indexStructureDefinitionBundle,
  isResourceTypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { FileBuilder } from './filebuilder';

const searchParams = readJson('fhir/r4/search-parameters.json');
const builder = new FileBuilder();

export function main(): void {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
  writeMigrations();
}

function writeMigrations(): void {
  const b = new FileBuilder();
  buildMigrationUp(b);
  // writeFileSync(resolve(__dirname, '../../server/src/migrations/init.ts'), b.toString(), 'utf8');
  writeFileSync(resolve(__dirname, '../../server/src/migrations/v42.ts'), builder.toString(), 'utf8');
}

function buildMigrationUp(b: FileBuilder): void {
  b.append("import { PoolClient } from 'pg';");
  b.newLine();
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;

  builder.append("import { PoolClient } from 'pg';");
  builder.newLine();
  builder.append('export async function run(client: PoolClient): Promise<void> {');
  builder.indentCount++;

  for (const [resourceType, typeSchema] of Object.entries(globalSchema.types)) {
    buildCreateTables(b, resourceType, typeSchema);
  }

  buildAddressTable(b);
  buildContactPointTable(b);
  buildIdentifierTable(b);
  buildHumanNameTable(b);
  buildValueSetElementTable(b);
  b.indentCount--;
  b.append('}');

  builder.indentCount--;
  builder.append('}');
}

function buildCreateTables(b: FileBuilder, resourceType: string, fhirType: TypeSchema): void {
  if (!isResourceTypeSchema(fhirType)) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }

  const columns = [
    '"id" UUID NOT NULL PRIMARY KEY',
    '"content" TEXT NOT NULL',
    '"lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL',
    '"deleted" BOOLEAN NOT NULL DEFAULT FALSE',
    '"compartments" UUID[] NOT NULL',
    '"_source" TEXT[]',
    '"_tag" TEXT[]',
    '"_profile" TEXT[]',
  ];

  columns.push(...buildSearchColumns(resourceType));

  b.newLine();
  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + resourceType + '" (');
  b.indentCount++;
  for (let i = 0; i < columns.length; i++) {
    b.append(columns[i] + (i !== columns.length - 1 ? ',' : ''));
  }
  b.indentCount--;
  b.append(')`);');
  b.newLine();

  b.append(`await client.query('CREATE INDEX ON "${resourceType}" ("lastUpdated")');`);
  b.append(`await client.query('CREATE INDEX ON "${resourceType}" USING GIN("compartments")');`);
  b.newLine();

  buildSearchIndexes(b, resourceType);

  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + resourceType + '_History" (');
  b.indentCount++;
  b.append('"versionId" UUID NOT NULL PRIMARY KEY,');
  b.append('"id" UUID NOT NULL,');
  b.append('"content" TEXT NOT NULL,');
  b.append('"lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL');
  b.indentCount--;
  b.append(')`);');
  b.newLine();

  b.append(`await client.query('CREATE INDEX ON "${resourceType}_History" ("id")');`);
  b.append(`await client.query('CREATE INDEX ON "${resourceType}_History" ("lastUpdated")');`);
  b.newLine();

  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + resourceType + '_Token" (');
  b.indentCount++;
  b.append('"resourceId" UUID NOT NULL,');
  b.append('"index" INTEGER NOT NULL,');
  b.append('"code" TEXT NOT NULL,');
  b.append('"system" TEXT,');
  b.append('"value" TEXT');
  b.indentCount--;
  b.append(')`);');
  b.newLine();

  b.append(`await client.query('CREATE INDEX ON "${resourceType}_Token" ("resourceId")');`);
  b.append(`await client.query('CREATE INDEX ON "${resourceType}_Token" ("code")');`);
  b.append(`await client.query('CREATE INDEX ON "${resourceType}_Token" ("system")');`);
  b.append(`await client.query('CREATE INDEX ON "${resourceType}_Token" ("value")');`);
  b.newLine();
}

function buildSearchColumns(resourceType: string): string[] {
  const result: string[] = [];
  for (const entry of searchParams.entry) {
    const searchParam = entry.resource;
    if (!searchParam.base?.includes(resourceType)) {
      continue;
    }

    const details = getSearchParameterDetails(resourceType, searchParam);
    if (isLookupTableParam(searchParam, details)) {
      continue;
    }

    const columnName = details.columnName;
    const newColumnType = getColumnType(details);
    result.push(`"${columnName}" ${newColumnType}`);

    if (details.array) {
      builder.append(
        `await client.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS "${resourceType}_${columnName}_idx" ON "${resourceType}" USING GIN("${columnName}")');`
      );
    } else {
      builder.append(
        `await client.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS "${resourceType}_${columnName}_idx" ON "${resourceType}" ("${columnName}")');`
      );
    }
  }
  return result;
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

    const elementDefinition = details.elementDefinition;
    if (elementDefinition?.type) {
      // Check for any "Identifier", "CodeableConcept", or "Coding"
      // Any of those value types require the "Token" table for full system|value search semantics.
      // The common case is that the "type" property only has one value,
      // but we need to support arrays of types for the choice-of-type properties such as "value[x]".
      for (const type of elementDefinition.type) {
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
  let baseColumnType = 'TEXT';
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
      baseColumnType = 'DOUBLE PRECISION';
      break;
  }

  return details.array ? baseColumnType + '[]' : baseColumnType;
}

function buildSearchIndexes(b: FileBuilder, resourceType: string): void {
  if (resourceType === 'User') {
    b.append(`await client.query('CREATE UNIQUE INDEX ON "User" ("email")');`);
  }
}

function buildAddressTable(b: FileBuilder): void {
  buildLookupTable(b, 'Address', ['address', 'city', 'country', 'postalCode', 'state', 'use']);
}

function buildContactPointTable(b: FileBuilder): void {
  buildLookupTable(b, 'ContactPoint', ['system', 'value']);
}

function buildIdentifierTable(b: FileBuilder): void {
  buildLookupTable(b, 'Identifier', ['system', 'value']);
}

function buildHumanNameTable(b: FileBuilder): void {
  buildLookupTable(b, 'HumanName', ['name', 'given', 'family']);
}

function buildLookupTable(b: FileBuilder, tableName: string, columns: string[]): void {
  b.newLine();
  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + tableName + '" (');
  b.indentCount++;
  b.append('"id" UUID NOT NULL PRIMARY KEY,');
  b.append('"resourceId" UUID NOT NULL,');
  b.append('"index" INTEGER NOT NULL,');
  b.append('"content" TEXT NOT NULL,');
  for (let i = 0; i < columns.length; i++) {
    b.append(`"${columns[i]}" TEXT` + (i !== columns.length - 1 ? ',' : ''));
  }
  b.indentCount--;
  b.append(')`);');
  b.newLine();
  for (const column of columns) {
    b.append(`await client.query('CREATE INDEX ON "${tableName}" ("${column}")');`);
  }
}

function buildValueSetElementTable(b: FileBuilder): void {
  b.newLine();
  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "ValueSetElement" (');
  b.indentCount++;
  b.append('"id" UUID NOT NULL PRIMARY KEY,');
  b.append('"system" TEXT,');
  b.append('"code" TEXT,');
  b.append('"display" TEXT');
  b.indentCount--;
  b.append(')`);');
  b.newLine();
  b.append(`await client.query('CREATE INDEX ON "ValueSetElement" ("system")');`);
  b.append(`await client.query('CREATE INDEX ON "ValueSetElement" ("code")');`);
  b.append(`await client.query('CREATE INDEX ON "ValueSetElement" ("display")');`);
}

if (process.argv[1].endsWith('migrate.ts')) {
  main();
}

import {
  getSearchParameterDetails,
  IndexedStructureDefinition,
  indexStructureDefinition,
  isLowerCase,
  SearchParameterDetails,
  SearchParameterType,
  TypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { FileBuilder } from './filebuilder';

const structureDefinitions = { types: {} } as IndexedStructureDefinition;
const searchParams = readJson('fhir/r4/search-parameters.json');
const builder = new FileBuilder();

export function main(): void {
  buildStructureDefinitions('profiles-types.json');
  buildStructureDefinitions('profiles-resources.json');
  buildStructureDefinitions('profiles-medplum.json');
  writeMigrations();
}

function buildStructureDefinitions(fileName: string): void {
  const resourceDefinitions = readJson(`fhir/r4/${fileName}`) as Bundle;
  for (const entry of resourceDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (
      resource.resourceType === 'StructureDefinition' &&
      resource.name &&
      resource.name !== 'Resource' &&
      resource.name !== 'BackboneElement' &&
      resource.name !== 'DomainResource' &&
      resource.name !== 'MetadataResource' &&
      !isLowerCase(resource.name[0])
    ) {
      indexStructureDefinition(structureDefinitions, resource);
    }
  }
}

function writeMigrations(): void {
  const b = new FileBuilder();
  buildMigrationUp(b);
  // writeFileSync(resolve(__dirname, '../../server/src/migrations/init.ts'), b.toString(), 'utf8');
  writeFileSync(resolve(__dirname, '../../server/src/migrations/v14.ts'), builder.toString(), 'utf8');
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

  for (const [resourceType, typeSchema] of Object.entries(structureDefinitions.types)) {
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

function isResourceType(typeSchema: TypeSchema): boolean {
  if (typeSchema.parentType || !typeSchema.properties) {
    return false;
  }
  for (const propertyName of ['id', 'meta', 'implicitRules', 'language']) {
    if (!(propertyName in typeSchema.properties)) {
      return false;
    }
  }
  return true;
}

function buildCreateTables(b: FileBuilder, resourceType: string, fhirType: TypeSchema): void {
  if (resourceType === 'Resource' || resourceType === 'DomainResource') {
    // Don't create tables for base types
    return;
  }

  if (!isResourceType(fhirType)) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }

  const columns = [
    '"id" UUID NOT NULL PRIMARY KEY',
    '"content" TEXT NOT NULL',
    '"lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL',
    '"deleted" BOOLEAN NOT NULL DEFAULT FALSE',
    '"compartments" UUID[] NOT NULL',
  ];

  builder.append(`await client.query('CREATE INDEX ON "${resourceType}" ("lastUpdated")');`);
  builder.append(`await client.query('CREATE INDEX ON "${resourceType}" USING GIN("compartments")');`);
  builder.append(`await client.query('CREATE INDEX ON "${resourceType}_History" ("id")');`);
  builder.append(`await client.query('CREATE INDEX ON "${resourceType}_History" ("lastUpdated")');`);
  builder.newLine();

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
}

function buildSearchColumns(resourceType: string): string[] {
  const result: string[] = [];
  for (const entry of searchParams.entry) {
    const searchParam = entry.resource;
    if (!searchParam.base?.includes(resourceType)) {
      continue;
    }
    if (isLookupTableParam(searchParam)) {
      continue;
    }

    const details = getSearchParameterDetails(structureDefinitions, resourceType, searchParam);
    const columnName = details.columnName;
    const newColumnType = getColumnType(details);
    result.push(`"${columnName}" ${newColumnType}`);
  }
  return result;
}

function isLookupTableParam(searchParam: any): boolean {
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
  if (nameParams.includes(searchParam.id)) {
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
  if (telecomParams.includes(searchParam.id)) {
    return true;
  }

  // Address
  const addressParams = ['individual-address', 'InsurancePlan-address', 'Location-address', 'Organization-address'];
  if (addressParams.includes(searchParam.id)) {
    return true;
  }

  // "address-"
  if (searchParam.code?.startsWith('address-')) {
    return true;
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

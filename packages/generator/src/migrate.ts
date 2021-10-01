import { Bundle, BundleEntry, getSearchParameterDetails, IndexedStructureDefinition, indexStructureDefinition, isLowerCase, Resource, SearchParameterDetails, SearchParameterType, TypeSchema } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { FileBuilder } from './filebuilder';

const structureDefinitions = { types: {} } as IndexedStructureDefinition;
const searchParams = readJson('fhir/r4/search-parameters.json');
const v3Builder = new FileBuilder();

export function main() {
  buildStructureDefinitions('profiles-types.json');
  buildStructureDefinitions('profiles-resources.json');
  writeMigrations();
}

function buildStructureDefinitions(fileName: string): void {
  const resourceDefinitions = readJson(`fhir/r4/${fileName}`) as Bundle;
  for (const entry of (resourceDefinitions.entry as BundleEntry[])) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' &&
      resource.name &&
      resource.name !== 'Resource' &&
      resource.name !== 'BackboneElement' &&
      resource.name !== 'DomainResource' &&
      resource.name !== 'MetadataResource' &&
      !isLowerCase(resource.name[0])) {
      indexStructureDefinition(resource, structureDefinitions);
    }
  }
}

function writeMigrations(): void {
  v3Builder.append('import { PoolClient } from \'pg\';');
  v3Builder.newLine();
  v3Builder.append('export async function run(client: PoolClient) {');
  v3Builder.indentCount++;

  const b = new FileBuilder();
  buildMigrationUp(b);
  // writeFileSync(resolve(__dirname, '../../server/src/migrations/v1.ts'), b.toString(), 'utf8');

  v3Builder.indentCount--;
  v3Builder.append('}');
  writeFileSync(resolve(__dirname, '../../server/src/migrations/v3.ts'), v3Builder.toString(), 'utf8');
}

function buildMigrationUp(b: FileBuilder): void {
  b.append('import { PoolClient } from \'pg\';');
  b.newLine();
  b.append('export async function run(client: PoolClient) {');
  b.indentCount++;

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
    console.log('Not a resource type', resourceType, fhirType.display);
    return;
  }

  const columns = [
    '"id" UUID NOT NULL PRIMARY KEY',
    '"content" TEXT NOT NULL',
    '"lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL',
    '"compartments" UUID[] NOT NULL',
  ];

  columns.push(...buildSearchColumns(resourceType));

  b.newLine();
  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + resourceType + '" (');
  b.indentCount++;
  for (let i = 0; i < columns.length; i++) {
    b.append(columns[i] + (i !== columns.length - 1 ? ',' : ''));
  }
  b.indentCount--;
  b.append(')`);')
  b.newLine();

  buildSearchIndexes(b, resourceType);

  b.append('await client.query(`CREATE TABLE IF NOT EXISTS "' + resourceType + '_History" (');
  b.indentCount++;
  b.append('"versionId" UUID NOT NULL PRIMARY KEY,');
  b.append('"id" UUID NOT NULL,');
  b.append('"content" TEXT NOT NULL,');
  b.append('"lastUpdated" TIMESTAMP WITH TIME ZONE NOT NULL');
  b.indentCount--;
  b.append(')`);')
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
    let oldColumnType;
    if (searchParam.code === 'active') {
      oldColumnType = 'BOOLEAN';
    } else if (isArrayParam(resourceType, columnName)) {
      oldColumnType = 'TEXT[]';
    } else {
      oldColumnType = 'TEXT';
    }

    const newColumnType = getColumnType(details);
    result.push(`"${columnName}" ${newColumnType}`);

    if (oldColumnType !== newColumnType) {
      let conversion;
      if (oldColumnType === 'TEXT' && newColumnType === 'TEXT[]') {
        conversion = `USING array["${columnName}"]::TEXT[]`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'DATE') {
        conversion = `USING "${columnName}"::DATE`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'DATE[]') {
        conversion = `USING array["${columnName}"]::DATE[]`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'BOOLEAN') {
        conversion = `USING "${columnName}"::BOOLEAN`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'BOOLEAN[]') {
        conversion = `USING array["${columnName}"]::BOOLEAN[]`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'DOUBLE PRECISION') {
        conversion = `USING "${columnName}"::DOUBLE PRECISION`;
      } else if (oldColumnType === 'TEXT' && newColumnType === 'DOUBLE PRECISION[]') {
        conversion = `USING array["${columnName}"]::DOUBLE PRECISION[]`;
      } else {
        console.log('UNKNOWN conversion: ', oldColumnType, newColumnType);
      }

      v3Builder.appendNoWrap(`await client.query('ALTER TABLE "${resourceType}" ALTER COLUMN "${columnName}" TYPE ${newColumnType} ${conversion}');`);
    }
  }
  return result;
}

function isLookupTableParam(searchParam: any) {
  // Identifier
  if (searchParam.code === 'identifier' && searchParam.type === 'token') {
    return true;
  }

  // HumanName
  const nameParams = ['individual-given', 'individual-family',
    'Patient-name', 'Person-name', 'Practitioner-name', 'RelatedPerson-name'];
  if (nameParams.includes(searchParam.id)) {
    return true;
  }

  // Telecom
  const telecomParams = ['individual-telecom', 'individual-email', 'individual-phone',
    'OrganizationAffiliation-telecom', 'OrganizationAffiliation-email', 'OrganizationAffiliation-phone'];
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
  // const details = getSearchParameterDetails(structureDefinitions, resourceType, searchParam);
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

/** @deprecated */
function isArrayParam(resourceType: string, propertyName: string): boolean {
  const typeDef = structureDefinitions.types[resourceType];
  if (!typeDef) {
    return false;
  }

  const propertyDef = typeDef.properties?.[propertyName];
  if (!propertyDef) {
    return false;
  }

  return propertyDef.max === '*';
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

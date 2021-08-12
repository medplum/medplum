import { readJson } from '@medplum/definitions';
import { writeFileSync } from 'fs';
import { JSONSchema6 } from 'json-schema';
import { resolve } from 'path';
import { FileBuilder, wordWrap } from './filebuilder';

const INDENT = ' '.repeat(2);

interface Property {
  resourceType: string;
  name: string;
  definition: JSONSchema6;
}

interface FhirType {
  definition: JSONSchema6;
  inputName: string;
  parentType?: string;
  outputName: string;
  properties: Property[];
  subTypes: FhirType[];
  resource: boolean;
  domainResource: boolean;
}

const baseResourceProperties = ['resourceType', 'id', 'meta', 'implicitRules', 'language'];
const domainResourceProperties = ['text', 'contained', 'extension', 'modifierExtension'];

const searchParams = readJson('fhir/r4/search-parameters.json');
const schema = readJson('fhir/r4/fhir.schema.json') as JSONSchema6;
const patientCompartment = readJson('fhir/r4/compartmentdefinition-patient.json');
const definitions = schema.definitions as { [k: string]: JSONSchema6; };

const fhirTypes: FhirType[] = [];
const fhirTypesMap: Record<string, FhirType> = {};

export function main() {

  for (const [resourceType, definition] of Object.entries(definitions)) {
    const fhirType = buildType(resourceType, definition);
    if (fhirType) {
      fhirTypes.push(fhirType);
      fhirTypesMap[fhirType.outputName] = fhirType;
    }
  }

  const parentTypes: Record<string, FhirType> = {};
  for (const fhirType of fhirTypes) {
    if (!fhirType.parentType) {
      parentTypes[fhirType.outputName] = fhirType;
    }
  }

  for (const fhirType of fhirTypes) {
    if (fhirType.parentType) {
      parentTypes[fhirType.parentType].subTypes.push(fhirType);
    }
  }

  writeIndexFile(Object.keys(parentTypes).sort());
  writeResourceFile(Object.entries(parentTypes).filter(e => e[1].resource).map(e => e[0]).sort());
  Object.values(parentTypes).forEach(fhirType => writeInterfaceFile(fhirType));
  writeMigrations();
}

function buildType(resourceType: string, definition: JSONSchema6): FhirType | undefined {
  if (!definition.properties) {
    return undefined;
  }

  let parentType;
  let outputName;
  if (resourceType.includes('_')) {
    const parts = resourceType.split('_');
    parentType = parts[0];
    outputName = parts[1].startsWith(parts[0]) ? parts[1] : parts[0] + parts[1];
  } else {
    parentType = undefined;
    outputName = resourceType;
  }

  const properties: Property[] = [];
  const propertyNames = new Set<string>();

  for (const [propertyName, propertyDefinition] of Object.entries(definition.properties)) {
    if (propertyName.startsWith('_')) {
      continue;
    }

    properties.push({
      resourceType,
      name: propertyName,
      definition: propertyDefinition as JSONSchema6
    });

    propertyNames.add(propertyName);
  }

  return {
    definition,
    inputName: resourceType,
    parentType,
    outputName,
    properties,
    subTypes: [],
    resource: containsAll(propertyNames, baseResourceProperties),
    domainResource: containsAll(propertyNames, domainResourceProperties)
  };
}

function writeIndexFile(names: string[]): void {
  const b = new FileBuilder(INDENT);
  for (const resourceType of [...names, 'Resource'].sort()) {
    b.append('export * from \'./' + resourceType + '\';');
  }
  writeFileSync(resolve(__dirname, '../../core/src/fhir/index.ts'), b.toString(), 'utf8');
}

function writeResourceFile(names: string[]): void {
  const b = new FileBuilder(INDENT);
  for (const resourceType of names) {
    b.append('import { ' + resourceType + ' } from \'./' + resourceType + '\';');
  }
  b.newLine();
  for (let i = 0; i < names.length; i++) {
    if (i === 0) {
      b.append('export type Resource = ' + names[0]);
      b.indentCount++;
    } else if (i !== names.length - 1) {
      b.append('| ' + names[i]);
    } else {
      b.append('| ' + names[i] + ';');
    }
  }
  writeFileSync(resolve(__dirname, '../../core/src/fhir/Resource.ts'), b.toString(), 'utf8');
}

function writeInterfaceFile(fhirType: FhirType): void {
  const includedTypes = new Set<string>();
  const referencedTypes = new Set<string>();
  buildImports(fhirType, includedTypes, referencedTypes);

  const b = new FileBuilder(INDENT);
  for (const referencedType of Array.from(referencedTypes).sort()) {
    if (!includedTypes.has(referencedType)) {
      b.append('import { ' + referencedType + ' } from \'./' + referencedType + '\';');
    }
  }

  writeInterface(b, fhirType);
  writeFileSync(resolve(__dirname, '../../core/src/fhir/' + fhirType.outputName + '.ts'), b.toString(), 'utf8');
}

function writeInterface(b: FileBuilder, fhirType: FhirType): void {
  const resourceType = fhirType.outputName;
  const genericTypes = ['Bundle', 'BundleEntry', 'OperationOutcome'];
  const genericModifier = genericTypes.includes(resourceType) ? '<T extends Resource = Resource>' : '';

  b.newLine();
  generateJavadoc(b, fhirType.definition.description);
  b.append('export interface ' + resourceType + genericModifier + ' {');
  b.indentCount++;

  for (const property of fhirType.properties) {
    b.newLine();
    generateJavadoc(b, property.definition.description);

    const typeName = getTypeScriptType(property);
    if (property.name === 'resourceType') {
      b.append('readonly ' + property.name + ': ' + typeName + ';');
    } else {
      b.append('readonly ' + property.name + '?: ' + typeName + ';');
    }
  }

  b.indentCount--;
  b.append('}');

  fhirType.subTypes.sort((t1, t2) => t1.outputName.localeCompare(t2.outputName));

  for (const subType of fhirType.subTypes) {
    b.newLine();
    writeInterface(b, subType);
  }
}

function writeMigrations(): void {
  const b = new FileBuilder(INDENT);
  buildMigrationUp(b);
  writeFileSync(resolve(__dirname, '../../server/src/migrations/v1.ts'), b.toString(), 'utf8');
}

function buildMigrationUp(b: FileBuilder): void {
  b.append('import { PoolClient } from \'pg\';');
  b.newLine();
  b.append('export async function run(client: PoolClient) {');
  b.indentCount++;

  for (const fhirType of fhirTypes) {
    buildCreateTables(b, fhirType);
  }

  buildAddressTable(b);
  buildContactPointTable(b);
  buildIdentifierTable(b);
  buildHumanNameTable(b);
  buildValueSetElementTable(b);
  b.indentCount--;
  b.append('}');
}

function buildCreateTables(b: FileBuilder, fhirType: FhirType): void {
  if (fhirType.parentType || !fhirType.resource) {
    // Don't create a table if fhirType is a subtype or not a resource type
    return;
  }

  const resourceType = fhirType.outputName;
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
    const columnName = convertCodeToColumnName(searchParam.code);
    if (searchParam.code === 'active') {
      result.push(`"${columnName}" BOOLEAN`)
    } else if (isArrayParam(resourceType, searchParam.code)) {
      result.push(`"${columnName}" TEXT[]`)
    } else {
      result.push(`"${columnName}" TEXT`)
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

function isArrayParam(resourceType: string, propertyName: string): boolean {
  const typeDef = definitions[resourceType];
  if (!typeDef) {
    return false;
  }

  const propertyDef = typeDef.properties?.[propertyName];
  if (!propertyDef) {
    return false;
  }

  return (propertyDef as JSONSchema6).type === 'array';
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

/**
 * Returns true if the resource type can be in a patient compartment.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @param resourceType The resource type.
 * @returns True if the resource type can be in a patient compartment.
 */
function isInPatientCompartment(resourceType: string): boolean {
  for (const resource of patientCompartment.resource) {
    if (resource.code === resourceType) {
      return resource.param && resource.param.length > 0;
    }
  }
  return false;
}

function buildImports(fhirType: FhirType, includedTypes: Set<string>, referencedTypes: Set<string>): void {
  includedTypes.add(fhirType.outputName);

  for (const property of fhirType.properties) {
    const cleanName = cleanReferencedType(getTypeScriptType(property));
    if (cleanName) {
      referencedTypes.add(cleanName);
    }
  }

  for (const subType of fhirType.subTypes) {
    buildImports(subType, includedTypes, referencedTypes);
  }
}

function cleanReferencedType(typeName: string): string | undefined {
  if (typeName.startsWith('\'') ||
    isLowerCase(typeName.charAt(0)) ||
    typeName === 'Date | string' ||
    typeName === '(Date | string)[]' ||
    typeName === 'BundleEntry<T>[]' ||
    typeName === 'T') {
    return undefined;
  }

  return typeName.replace('[]', '');
}

function getTypeScriptType(property: Property): string {
  const constValue = property.definition['const'];
  if (constValue) {
    return '\'' + constValue + '\'';
  }

  if (property.resourceType === 'OperationOutcome' && property.name === 'resource') {
    return 'T';
  }

  if (property.resourceType === 'Bundle' && property.name === 'entry') {
    return 'BundleEntry<T>[]';
  }

  if (property.resourceType === 'Bundle_Entry' && property.name === 'resource') {
    return 'T';
  }

  const typeValue = property.definition.type;
  if (typeValue) {
    if (typeValue === 'array') {
      const itemDefinition = property.definition.items as JSONSchema6 | undefined;
      if (itemDefinition && itemDefinition.$ref) {
        const itemType = getTypeScriptTypeFromDefinition(itemDefinition.$ref);
        if (itemType.includes(' | ')) {
          return '(' + itemType + ')[]';
        } else {
          return itemType + '[]';
        }
      } else if (itemDefinition && itemDefinition.enum) {
        return 'string[]';
      } else {
        return 'any[]';
      }
    } else {
      return getTypeScriptTypeFromDefinition(typeValue as string);
    }
  }

  if (property.definition.enum) {
    return 'string';
  }

  const ref = property.definition.$ref;
  if (ref) {
    return getTypeScriptTypeFromDefinition(ref);
  }

  return 'any';
}


function generateJavadoc(b: FileBuilder, text: string | undefined): void {
  if (!text) {
    return;
  }

  b.append('/**');

  for (const textLine of text.split('\n')) {
    for (const javadocLine of wordWrap(textLine, 70)) {
      b.appendNoWrap(' ' + ('* ' + escapeHtml(javadocLine)).trim());
    }
  }

  b.append(' */');
}

function getTypeScriptTypeFromDefinition(ref: string): string {
  ref = ref.replace('#/definitions/', '');

  switch (ref) {
    case 'boolean':
      return 'boolean';

    case 'base64Binary':
    case 'canonical':
    case 'code':
    case 'id':
    case 'markdown':
    case 'string':
    case 'uri':
    case 'url':
    case 'xhtml':
      return 'string';

    case 'date':
    case 'dateTime':
    case 'instant':
    case 'time':
      return 'Date | string';

    case 'decimal':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
    case 'number':
      return 'number';

    case 'ResourceList':
      return 'Resource';
  }

  if (ref.indexOf('_') >= 0) {
    const parts = ref.split('_');
    if (parts[1].startsWith(parts[0])) {
      return parts[1];
    } else {
      return parts[0] + parts[1];
    }
  }

  return ref;
}

function containsAll(set: Set<string>, values: string[]): boolean {
  for (const value of values) {
    if (!set.has(value)) {
      return false;
    }
  }
  return true;
}

function isLowerCase(c: string): boolean {
  return c === c.toLowerCase();
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/“/g, '&ldquo;')
    .replace(/”/g, '&rdquo;')
    .replace(/‘/g, '&lsquo;')
    .replace(/’/g, '&rsquo;')
    .replace(/…/g, '&hellip;');
}

/**
 * Converts a hyphen-delimited code to camelCase string.
 * @param code The search parameter code.
 * @returns The SQL column name.
 */
function convertCodeToColumnName(code: string): string {
  return code.split('-')
    .reduce((result, word, index) => result + (index ? upperFirst(word) : word), '');
}

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.substr(1);
}

if (process.argv[1].endsWith('index.ts')) {
  main();
}

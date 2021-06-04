import { readJson } from '@medplum/definitions';
import { FileBuilder, wordWrap } from './filebuilder';
import { writeFileSync } from 'fs';

const INDENT = ' '.repeat(2);

interface Property {
  resourceType: string;
  name: string;
  definition: any;
}

interface FhirType {
  definition: any;
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

const fhirTypes: FhirType[] = [];
const fhirTypesMap: Record<string, FhirType> = {};

function main() {
  const schema = readJson('fhir/r4/fhir.schema.json');
  const definitions = schema.definitions;

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
  writeMigrations(parentTypes);
}

function buildType(resourceType: string, definition: any): FhirType | undefined {
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
      definition: propertyDefinition
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
  writeFileSync('../core/src/fhir/index.ts', b.toString(), 'utf8');
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
  writeFileSync('../core/src/fhir/Resource.ts', b.toString(), 'utf8');
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
  writeFileSync('../core/src/fhir/' + fhirType.outputName + '.ts', b.toString(), 'utf8');
}

function writeInterface(b: FileBuilder, fhirType: FhirType): void {
  const resourceType = fhirType.outputName;

  b.newLine();
  generateJavadoc(b, fhirType.definition.description);
  b.append('export interface ' + resourceType + ' {');
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

function writeMigrations(fhirTypes: Record<string, FhirType>): void {
  const searchParams = readJson('fhir/r4/search-parameters.json');

  const b = new FileBuilder(INDENT);

  b.append('import { Knex } from \'knex\';');
  b.newLine();
  b.append('export async function up(knex) {');
  b.indentCount++;

  for (const [resourceType, fhirType] of Object.entries(fhirTypes)) {
    if (!fhirType.resource) {
      continue;
    }

    b.newLine();
    b.append('await knex.schema.createTable(\'' + resourceType + '\', t => {');
    b.indentCount++;
    b.append('t.uuid(\'id\').notNullable().primary();');
    b.append('t.text(\'content\').notNullable();');
    b.append('t.dateTime(\'lastUpdated\').notNullable();');

    for (const entry of searchParams.entry) {
      const searchParam = entry.resource;
      if (searchParam.base?.includes(resourceType)) {
        if (searchParam.code === 'active') {
          b.append('t.boolean(\'' + searchParam.code + '\');');
        } else if (searchParam.type === 'date') {
          b.append('t.date(\'' + searchParam.code + '\');');
        } else {
          b.append('t.string(\'' + searchParam.code + '\', 128);');
        }
      }
    }

    b.indentCount--;
    b.append('});');
    b.newLine();
    b.append('await knex.schema.createTable(\'' + resourceType + '_History\', t => {');
    b.indentCount++;
    b.append('t.uuid(\'versionId\').notNullable().primary();');
    b.append('t.uuid(\'id\').notNullable();');
    b.append('t.text(\'content\').notNullable();');
    b.append('t.dateTime(\'lastUpdated\').notNullable();');
    b.indentCount--;
    b.append('});');
  }

  b.indentCount--;
  b.append('}');
  b.newLine();
  b.append('export async function down(knex) {');
  b.indentCount++;
  b.append('// TODO');
  b.indentCount--;
  b.append('}');

  writeFileSync('../server/src/migrations/0_init.js', b.toString(), 'utf8');
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
    typeName === 'Date' ||
    typeName === 'Date[]') {
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
    return 'Resource';
  }

  const typeValue = property.definition.type;
  if (typeValue) {
    if (typeValue === 'array') {
      const itemDefinition = property.definition.items;
      if (itemDefinition && itemDefinition.$ref) {
        return getTypeScriptTypeFromDefinition(itemDefinition.$ref) + '[]';
      } else if (itemDefinition && itemDefinition.enum) {
        return 'string[]';
      } else {
        return 'any[]';
      }
    } else {
      return getTypeScriptTypeFromDefinition(typeValue);
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


function generateJavadoc(b: FileBuilder, text: string): void {
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
      return 'Date';

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

main();

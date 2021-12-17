import {
  Bundle,
  BundleEntry,
  capitalize,
  ElementDefinition,
  ElementDefinitionType,
  IndexedStructureDefinition,
  indexStructureDefinition,
  Resource,
  TypeSchema,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { FileBuilder, wordWrap } from './filebuilder';

interface Property {
  resourceType: string;
  name: string;
  definition: ElementDefinition;
}

interface FhirType {
  definition: TypeSchema;
  inputName: string;
  parentType?: string;
  outputName: string;
  properties: Property[];
  subTypes: FhirType[];
  resource: boolean;
  domainResource: boolean;
}

const baseResourceProperties = ['id', 'meta', 'implicitRules', 'language'];
const domainResourceProperties = ['text', 'contained', 'extension', 'modifierExtension'];
const structureDefinitions = { types: {} } as IndexedStructureDefinition;
const fhirTypes: FhirType[] = [];
const fhirTypesMap: Record<string, FhirType> = {};

export function main() {
  buildStructureDefinitions('profiles-types.json');
  buildStructureDefinitions('profiles-resources.json');
  buildStructureDefinitions('profiles-medplum.json');

  for (const [resourceType, definition] of Object.entries(structureDefinitions.types)) {
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
      fhirTypesMap[fhirType.parentType].subTypes.push(fhirType);
    }
  }

  mkdirSync(resolve(__dirname, '../../fhirtypes/dist'), { recursive: true });
  writeIndexFile(Object.keys(parentTypes).sort());
  writeResourceFile(
    Object.entries(parentTypes)
      .filter((e) => e[1].resource)
      .map((e) => e[0])
      .sort()
  );
  Object.values(parentTypes).forEach((fhirType) => writeInterfaceFile(fhirType));
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
      indexStructureDefinition(resource, structureDefinitions);
    }
  }
}

function buildType(resourceType: string, definition: TypeSchema): FhirType | undefined {
  if (!definition.properties) {
    return undefined;
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
      definition: propertyDefinition,
    });

    propertyNames.add(propertyName);
  }

  return {
    definition,
    inputName: resourceType,
    parentType: definition.parentType,
    outputName: resourceType,
    properties,
    subTypes: [],
    resource: containsAll(propertyNames, baseResourceProperties),
    domainResource: containsAll(propertyNames, domainResourceProperties),
  };
}

function writeIndexFile(names: string[]): void {
  const b = new FileBuilder();
  for (const resourceType of [...names, 'Resource'].sort()) {
    if (resourceType === 'MoneyQuantity' || resourceType === 'SimpleQuantity') {
      continue;
    }
    b.append("export * from './" + resourceType + "';");
  }
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/index.d.ts'), b.toString(), 'utf8');
}

function writeResourceFile(names: string[]): void {
  const b = new FileBuilder();
  for (const resourceType of names) {
    b.append('import { ' + resourceType + " } from './" + resourceType + "';");
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
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/Resource.d.ts'), b.toString(), 'utf8');
}

function writeInterfaceFile(fhirType: FhirType): void {
  if (fhirType.properties.length === 0 && fhirType.subTypes.length === 0) {
    return;
  }

  const includedTypes = new Set<string>();
  const referencedTypes = new Set<string>();
  buildImports(fhirType, includedTypes, referencedTypes);

  const b = new FileBuilder();
  for (const referencedType of Array.from(referencedTypes).sort()) {
    if (!includedTypes.has(referencedType)) {
      b.append('import { ' + referencedType + " } from './" + referencedType + "';");
    }
  }

  writeInterface(b, fhirType);
  writeFileSync(resolve(__dirname, '../../fhirtypes/dist/' + fhirType.outputName + '.d.ts'), b.toString(), 'utf8');
}

function writeInterface(b: FileBuilder, fhirType: FhirType): void {
  const resourceType = fhirType.outputName;
  const genericTypes = ['Bundle', 'BundleEntry', 'Reference'];
  const genericModifier = genericTypes.includes(resourceType) ? '<T extends Resource = Resource>' : '';

  b.newLine();
  generateJavadoc(b, fhirType.definition.description);
  b.append('export interface ' + resourceType + genericModifier + ' {');
  b.indentCount++;

  if (fhirType.resource) {
    b.newLine();
    generateJavadoc(b, `This is a ${resourceType} resource`);
    b.append(`readonly resourceType: '${resourceType}';`);
  }

  for (const property of fhirType.properties) {
    b.newLine();
    writeInterfaceProperty(b, fhirType, property);
  }

  if (fhirType.outputName === 'Reference') {
    b.newLine();
    generateJavadoc(b, 'Optional Resource referred to by this reference.');
    b.append('readonly resource?: T;');
  }

  b.indentCount--;
  b.append('}');

  fhirType.subTypes.sort((t1, t2) => t1.outputName.localeCompare(t2.outputName));

  for (const subType of fhirType.subTypes) {
    writeInterface(b, subType);
  }
}

function writeInterfaceProperty(b: FileBuilder, fhirType: FhirType, property: Property): void {
  for (const typeScriptProperty of getTypeScriptProperties(property)) {
    b.newLine();
    generateJavadoc(b, property.definition.definition);
    b.append('readonly ' + typeScriptProperty.name + '?: ' + typeScriptProperty.typeName + ';');
  }
}

function buildImports(fhirType: FhirType, includedTypes: Set<string>, referencedTypes: Set<string>): void {
  includedTypes.add(fhirType.outputName);

  for (const property of fhirType.properties) {
    for (const typeScriptProperty of getTypeScriptProperties(property)) {
      cleanReferencedType(typeScriptProperty.typeName).forEach((cleanName) => referencedTypes.add(cleanName));
    }
  }

  for (const subType of fhirType.subTypes) {
    buildImports(subType, includedTypes, referencedTypes);
  }

  if (fhirType.outputName === 'Reference') {
    referencedTypes.add('Resource');
  }
}

function cleanReferencedType(typeName: string): string[] {
  if (typeName === 'T') {
    return ['Resource'];
  }

  if (typeName.startsWith("'") || isLowerCase(typeName.charAt(0)) || typeName === 'BundleEntry<T>[]') {
    return [];
  }

  if (typeName.startsWith('Reference<')) {
    const start = typeName.indexOf('<') + 1;
    const end = typeName.indexOf('>');
    return ['Reference', ...typeName.substring(start, end).split(' | ')];
  }

  return [typeName.replace('[]', '')];
}

function getTypeScriptProperties(property: Property): { name: string; typeName: string }[] {
  if (
    property.name === 'resource' &&
    ['BundleEntry', 'OperationOutcome', 'Reference'].includes(property.resourceType)
  ) {
    return [{ name: 'resource', typeName: 'T' }];
  }

  if (property.resourceType === 'Bundle' && property.name === 'entry') {
    return [{ name: 'entry', typeName: 'BundleEntry<T>[]' }];
  }

  const result = [];
  if (property.definition.contentReference) {
    const baseName = property.definition.contentReference.replace('#', '').split('.').map(capitalize).join('');
    const typeName = property.definition.max === '*' ? baseName + '[]' : baseName;
    result.push({
      name: property.name,
      typeName,
    });
  } else if (property.name.endsWith('[x]')) {
    const baseName = property.name.replace('[x]', '');
    const propertyTypes = property.definition.type as ElementDefinitionType[];
    for (const propertyType of propertyTypes) {
      const code = propertyType.code as string;
      result.push({
        name: baseName + capitalize(code),
        typeName: getTypeScriptTypeForProperty(property, propertyType),
      });
    }
  } else {
    result.push({
      name: property.name,
      typeName: getTypeScriptTypeForProperty(property, property.definition?.type?.[0] as ElementDefinitionType),
    });
  }

  return result;
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

function getTypeScriptTypeForProperty(property: Property, typeDefinition: ElementDefinitionType): string {
  let baseType = typeDefinition.code as string;

  switch (baseType) {
    case 'base64Binary':
    case 'canonical':
    case 'code':
    case 'id':
    case 'markdown':
    case 'oid':
    case 'string':
    case 'uri':
    case 'url':
    case 'uuid':
    case 'xhtml':
    case 'http://hl7.org/fhirpath/System.String':
      baseType = 'string';
      break;

    case 'date':
    case 'dateTime':
    case 'instant':
    case 'time':
      baseType = 'string';
      break;

    case 'decimal':
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
    case 'number':
      baseType = 'number';
      break;

    case 'ResourceList':
      baseType = 'Resource';
      break;

    case 'Element':
    case 'BackboneElement':
      baseType = property.resourceType + capitalize(property.name);
      break;

    case 'Reference':
      if (typeDefinition.targetProfile && typeDefinition.targetProfile.length > 0) {
        baseType += '<';
        for (const targetProfile of typeDefinition.targetProfile) {
          if (!baseType.endsWith('<')) {
            baseType += ' | ';
          }
          baseType += targetProfile.split('/').pop();
        }
        baseType += '>';
      }
      break;
  }

  if (property.definition.max === '*') {
    return baseType + '[]';
  }
  return baseType;
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

if (process.argv[1].endsWith('index.ts')) {
  main();
}

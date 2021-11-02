import { Bundle, BundleEntry, ElementDefinition, getExpressionForResourceType, IndexedStructureDefinition, indexStructureDefinition, isLowerCase, Resource, SearchParameter, TypeSchema } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { writeFileSync } from 'fs';
import { resolve } from 'path/posix';
import { FileBuilder } from './filebuilder';

const structureDefinitions = { types: {} } as IndexedStructureDefinition;
const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

export function main() {
  buildStructureDefinitions('profiles-types.json');
  buildStructureDefinitions('profiles-resources.json');
  writeDocs();
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

function writeDocs(): void {
  const entries = Object.entries(structureDefinitions.types)
  for (let i = 0; i < entries.length; i++) {
    const [resourceType, typeSchema] = entries[i];
    if (isResourceType(typeSchema) && resourceType !== 'Parameters') {
      writeDocsForType(i, resourceType, typeSchema);
    }
  }
}

function writeDocsForType(i: number, resourceType: string, typeSchema: TypeSchema): void {
  const fileBuilder = new FileBuilder(' ', false);
  fileBuilder.append('---');
  fileBuilder.append(`title: ${resourceType}`);
  fileBuilder.append('sidebar_position: ' + (i + 1));
  fileBuilder.append('---');
  fileBuilder.newLine();

  fileBuilder.append(`# ${resourceType}`);
  fileBuilder.newLine();
  fileBuilder.append(typeSchema.description as string);
  fileBuilder.newLine();

  fileBuilder.append(`## Properties`);
  fileBuilder.newLine();
  fileBuilder.append(`| Name | Card | Type | Description |`);
  fileBuilder.append(`| --- | --- | --- | --- |`);
  const properties = Object.entries(typeSchema.properties);
  for (let j = 0; j < properties.length; j++) {
    const [propertyName, propertySchema] = properties[j];
    fileBuilder.append(
      `| ${propertyName} ` +
      `| ${propertySchema.min}..${propertySchema.max} ` +
      `| ${getPropertyType(propertySchema)} ` +
      `| ${escapeTableCell(propertySchema.short)}`);
  }
  fileBuilder.newLine();

  fileBuilder.append(`## Search Parameters`);
  fileBuilder.newLine();
  fileBuilder.append(`| Name | Type | Description | Expression`);
  fileBuilder.append(`| --- | --- | --- | --- |`);

  for (const entry of (searchParams.entry as BundleEntry[])) {
    const searchParam = entry.resource as SearchParameter;
    if (!searchParam.base?.includes(resourceType)) {
      continue;
    }
    fileBuilder.appendNoWrap(
      `| ${searchParam.name} ` +
      `| ${searchParam.type} ` +
      `| ${escapeTableCell(getSearchParamDescription(searchParam, resourceType))} ` +
      `| ${escapeTableCell(getExpressionForResourceType(resourceType, searchParam.expression as string))}`);
  }

  fileBuilder.newLine();
  writeFileSync(resolve(__dirname, `../../../docs/docs/fhir/${resourceType.toLowerCase()}.md`), fileBuilder.toString(), 'utf8');
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

function getPropertyType(property: ElementDefinition | undefined): string {
  const type = property?.type;
  if (!type) {
    return '';
  }

  const code = type[0].code;
  if (code === 'http://hl7.org/fhirpath/System.String') {
    return 'string';
  }

  return code || '';
}

function getSearchParamDescription(searchParam: SearchParameter, resourceType: string): string {
  const desc = searchParam.description;
  if (!desc) {
    return '';
  }

  if (desc.startsWith('Multiple Resources:')) {
    const lines = desc.split('\n');
    const resourceTypeLine = lines.find(line => line.startsWith(`* [${resourceType}]`));
    if (resourceTypeLine) {
      return resourceTypeLine.substring(resourceTypeLine.indexOf(':') + 1);
    }
  }

  return desc;
}

function escapeTableCell(input: string | undefined): string {
  if (!input) {
    return '';
  }
  return input.replace('\n', ' ').replace(/\|/g, '\\|').trim();
}

if (process.argv[1].endsWith('docs.ts')) {
  main();
}

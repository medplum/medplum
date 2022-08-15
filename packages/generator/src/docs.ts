import { isLowerCase } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import {
  Bundle,
  BundleEntry,
  ElementDefinition,
  Resource,
  SearchParameter,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path/posix';
import { PropertyDocInfo, ResourceDocsProps } from '../../docs/src/types/documentationTypes';

const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

export function main(): void {
  const indexedSearchParams = indexSearchParameters(searchParams);
  const docsDefinitions = buildDocsDefinitions('profiles-resources.json', indexedSearchParams);
  writeDocs(docsDefinitions);
}

function indexSearchParameters(searchParams: Bundle): Record<string, SearchParameter[]> {
  const entries = searchParams.entry || [];
  const results = {} as Record<string, SearchParameter[]>;
  for (const entry of entries) {
    const searchParam = entry.resource as SearchParameter;
    for (const resType in searchParam.base || []) {
      if (!results[resType]) {
        results.resType = [];
      }
      results[resType].push(searchParam);
    }
  }
  return results;
}

function buildDocsDefinitions(
  fileName: string,
  indexedSearchParams: Record<string, SearchParameter[]>
): ResourceDocsProps[] {
  const results = [];
  const resourceDefinitions = readJson(`fhir/r4/${fileName}`) as Bundle;
  console.log('Definitions', resourceDefinitions);
  for (const entry of resourceDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (
      resource.resourceType === 'StructureDefinition' &&
      resource.kind === 'resource' &&
      resource.name &&
      !isLowerCase(resource.name?.[0])
    ) {
      results.push(buildDocsDefinition(resource as StructureDefinition, indexedSearchParams[resource.name as string]));
    }
  }
  return results;
}

function buildDocsDefinition(
  resourceDefinition: StructureDefinition,
  searchParameters: SearchParameter[]
): ResourceDocsProps {
  const result = {
    resourceName: resourceDefinition.name as string,
    description: resourceDefinition.description || '',
    properties: [] as PropertyDocInfo[],
  } as ResourceDocsProps;
  const elements = resourceDefinition.snapshot?.element || [];
  for (const element of elements) {
    const parts = element.path?.split('.') || [];
    const name = parts[parts.length - 1];
    const { path, min, max, short, definition, comment } = element;
    result.properties.push({
      name,
      depth: parts.length - 1,
      type: getPropertyType(element),
      path: path || '',
      min: min || 0,
      max: max || '',
      short: short || '',
      definition: definition || '',
      comment: comment || '',
    });
  }

  result.searchParameters = searchParameters.map((param) => ({
    name: param.name || '',
    type: param.type || '',
    description: getSearchParamDescription(param, result.resourceName),
    expression: param.expression || '',
  }));
  console.log(result);
  return result;
}

function writeDocs(definitions: ResourceDocsProps[]): void {
  for (const definition of definitions) {
    console.log(definition);
    break;
    writeFileSync(
      resolve(__dirname, `../docs/static/data/resources/${definition.resourceName.toLowerCase()}.json`),
      JSON.stringify(definition, null, 2)
    );
  }
}

function getSearchParamDescription(searchParam: SearchParameter, resourceType: string): string {
  const desc = searchParam.description;
  if (!desc) {
    return '';
  }

  if (desc.startsWith('Multiple Resources:')) {
    const lines = desc.split('\n');
    const resourceTypeLine = lines.find((line) => line.startsWith(`* [${resourceType}]`));
    if (resourceTypeLine) {
      return resourceTypeLine.substring(resourceTypeLine.indexOf(':') + 1);
    }
  }

  return desc;
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

import { getExpressionForResourceType, isLowerCase } from '@medplum/core';
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
  writeDocs(docsDefinitions, 'resource');
}

function indexSearchParameters(searchParams: Bundle): Record<string, SearchParameter[]> {
  const entries = searchParams.entry || [];
  const results = {} as Record<string, SearchParameter[]>;
  for (const entry of entries) {
    const searchParam = entry.resource as SearchParameter;
    for (const resType of searchParam.base || []) {
      if (!results[resType]) {
        results[resType] = [];
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
  for (const entry of resourceDefinitions.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (
      resource.resourceType === 'StructureDefinition' &&
      resource.kind === 'resource' &&
      resource.name &&
      resource.name !== 'Resource' &&
      resource.name !== 'BackboneElement' &&
      resource.name !== 'DomainResource' &&
      resource.name !== 'MetadataResource' &&
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
      ...getPropertyTypes(element),
      path: path || '',
      min: min || 0,
      max: max || '',
      short: short || '',
      definition: definition || '',
      comment: comment || '',
      ...getInheritance(element),
    });
  }

  result.searchParameters = (searchParameters || []).map((param) => ({
    name: param.name || '',
    type: param.type || '',
    description: getSearchParamDescription(param, result.resourceName),
    expression: getExpressionForResourceType(result.resourceName, param.expression || '') || '',
  }));
  return result;
}

function buildDocsMarkdown(position: number, definition: ResourceDocsProps): string {
  const resourceName = definition.resourceName;
  const description = rewriteLinks(definition.description);
  return `\
---
title: ${resourceName}
sidebar_position: ${position}
---

import definition from '@site/static/data/resourceDefinitions/${resourceName.toLowerCase()}.json';
import { ResourcePropertiesTable, SearchParamsTable } from '@site/src/components/ResourceTables';

# ${resourceName}

${description}

## Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => !(p.inherited && p.base.includes('Resource')))} />

## Search Parameters

<SearchParamsTable searchParams={definition.searchParameters} />

## Inherited Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => p.inherited && p.base.includes('Resource'))} />


`;
}

function writeDocs(definitions: ResourceDocsProps[], definitionType: string): void {
  definitions.forEach((definition, i) => {
    const resourceName = definition.resourceName.toLowerCase();
    writeFileSync(
      resolve(__dirname, `../../docs/static/data/${definitionType}Definitions/${resourceName}.json`),
      JSON.stringify(definition, null, 2),
      // JSON.stringify(definition),
      'utf8'
    );
    writeFileSync(
      resolve(__dirname, `../../docs/docs/api/fhir/${definitionType}s/${resourceName}.mdx`),
      buildDocsMarkdown(i, definition),
      'utf8'
    );
  });
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

function getPropertyTypes(property: ElementDefinition | undefined): Pick<PropertyDocInfo, 'types' | 'referenceTypes'> {
  const type = property?.type;
  if (!type) {
    return { types: [''] };
  }

  const types = type
    .map((t) => t.code || '')
    .map((code) => (code === 'http://hl7.org/fhirpath/System.String' ? 'string' : code));

  const referenceIndex = types.indexOf('Reference');
  if (referenceIndex >= 0) {
    const referenceTypes =
      type[referenceIndex].targetProfile
        ?.filter((target) => target.startsWith('http://hl7.org/fhir/StructureDefinition/'))
        .map((target) => target.split('/').pop() || '') || [];
    return { types, referenceTypes };
  }
  return { types };
}

function getInheritance(property: ElementDefinition): { inherited: boolean; base?: string } {
  const inheritanceBase = property.base?.path?.split('.')[0];
  const inherited = property.path?.split('.')[0] !== inheritanceBase;
  if (!inherited) {
    return { inherited };
  }
  return { inherited, base: inheritanceBase };
}

function rewriteLinks(description: string): string {
  description = description
    .replace('(operations.html)', '(/api/fhir/operations)')
    .replace('(terminologies.html)', '(https://www.hl7.org/fhir/terminologies.html)');

  // Replace all the links of [[[Type]]] with internal links
  const typeLinks = Array.from(description.matchAll(/\[\[\[([A-Z][a-z]*)*\]\]\]/gi));
  for (const match of typeLinks) {
    description = description.replace(match[0], `[${match[1]}](./${match[1].toLowerCase()})`);
    console.log(match[0], description);
  }

  return description;
}

if (process.argv[1].endsWith('docs.ts')) {
  main();
}

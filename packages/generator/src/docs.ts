import { getExpressionForResourceType, isLowerCase } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, ElementDefinition, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path/posix';
import {
  DocumentationLocation,
  PropertyDocInfo,
  PropertyTypeDocInfo,
  ResourceDocsProps,
} from '../../docs/src/types/documentationTypes';

const searchParams = readJson('fhir/r4/search-parameters.json') as Bundle;

let documentedTypes: Record<string, DocumentationLocation>;

export function main(): void {
  const indexedSearchParams = indexSearchParameters(searchParams);
  // Definitions for FHIR Spec resources
  const fhirCoreDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-resources.json`));
  // Medplum-defined resources
  const medplumResourceDefinitions = filterDefinitions(readJson(`fhir/r4/profiles-medplum.json`));
  // StructureDefinitions for FHIR "Datatypes" (e.g. Address, ContactPoint, Identifier...)
  const fhirDatatypes = filterDefinitions(readJson(`fhir/r4/profiles-types.json`));

  // Map from resource/datatype name -> documented location
  documentedTypes = {
    ...Object.fromEntries(
      fhirCoreDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'resource'])
    ),
    ...Object.fromEntries(fhirDatatypes.map((def): [string, DocumentationLocation] => [def.name || '', 'datatype'])),
    ...Object.fromEntries(
      medplumResourceDefinitions.map((def): [string, DocumentationLocation] => [def.name || '', 'medplum'])
    ),
  };

  const fhirResourceDocs = buildDocsDefinitions(fhirCoreDefinitions, 'resource', indexedSearchParams);
  const medplumResourceDocs = buildDocsDefinitions(medplumResourceDefinitions, 'medplum', indexedSearchParams);
  const fhirDatatypeDocs = buildDocsDefinitions(fhirDatatypes, 'datatype');
  writeDocs(fhirResourceDocs, 'resource');
  writeDocs(fhirDatatypeDocs, 'datatype');
  writeDocs(medplumResourceDocs, 'medplum');
}

/**
 * Indexes searcch parameters by "base" resource type.
 * @param searchParams The bundle of SearchParameter resources.
 * @returns A map from resourceType -> an array of associated SearchParameters
 */
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
  definitions: StructureDefinition[],
  location: DocumentationLocation,
  indexedSearchParams?: Record<string, SearchParameter[]>
): ResourceDocsProps[] {
  const results = [];
  for (const definition of definitions) {
    results.push(buildDocsDefinition(definition, location, indexedSearchParams?.[definition.name as string]));
  }

  return results;
}

function buildDocsDefinition(
  resourceDefinition: StructureDefinition,
  location: DocumentationLocation,
  searchParameters?: SearchParameter[]
): ResourceDocsProps {
  const result = {
    name: resourceDefinition.name as string,
    location,
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

  if (searchParameters) {
    result.searchParameters = (searchParameters || []).map((param) => ({
      name: param.name as string,
      type: param.type as
        | 'string'
        | 'number'
        | 'uri'
        | 'date'
        | 'token'
        | 'reference'
        | 'composite'
        | 'quantity'
        | 'special',
      description: getSearchParamDescription(param, result.name),
      expression: getExpressionForResourceType(result.name, param.expression || '') || '',
    }));
  }
  return result;
}

function buildDocsMarkdown(position: number, definition: ResourceDocsProps): string {
  const resourceName = definition.name;
  const description = rewriteLinks(definition.description);
  return `\
---
title: ${resourceName}
sidebar_position: ${position}
---

import definition from '@site/static/data/${definition.location}Definitions/${resourceName.toLowerCase()}.json';
import { ResourcePropertiesTable, SearchParamsTable } from '@site/src/components/ResourceTables';

# ${resourceName}

${description}

## Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => !(p.inherited && p.base.includes('Resource')))} />

${
  definition.location === 'resource' || definition.location === 'medplum'
    ? `## Search Parameters

<SearchParamsTable searchParams={definition.searchParameters} />

## Inherited Properties

<ResourcePropertiesTable properties={definition.properties.filter((p) => p.inherited && p.base.includes('Resource'))} />
`
    : ''
}

`;
}

function writeDocs(definitions: ResourceDocsProps[], location: DocumentationLocation): void {
  definitions.forEach((definition, i) => {
    const resourceName = definition.name.toLowerCase();
    writeFileSync(
      resolve(__dirname, `../../docs/static/data/${location}Definitions/${resourceName}.json`),
      JSON.stringify(definition, null, 2),
      // JSON.stringify(definition),
      'utf8'
    );
    writeFileSync(
      resolve(__dirname, `../../docs/docs/api/fhir/${pluralize(location)}/${resourceName}.mdx`),
      buildDocsMarkdown(i, definition),
      'utf8'
    );
  });
}

function filterDefinitions(bundle: Bundle): StructureDefinition[] {
  const definitions: StructureDefinition[] =
    bundle.entry
      ?.map((e) => e.resource as StructureDefinition)
      .filter((definition) => definition.resourceType === 'StructureDefinition') || [];

  return definitions.filter(
    (definition) =>
      definition.kind &&
      ['resource', 'complex-type'].includes(definition.kind) &&
      definition.name &&
      !['Resource', 'BackboneElement', 'DomainResource', 'MetadataResource', 'Element'].includes(definition.name) &&
      !isLowerCase(definition.name?.[0])
  );
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
    return { types: [{ datatype: '', documentLocation: undefined }] };
  }

  const types: PropertyTypeDocInfo[] = type
    .map((t) => t.code || '')
    .map((code) =>
      code === 'http://hl7.org/fhirpath/System.String'
        ? { datatype: 'string', documentLocation: undefined }
        : { datatype: code, documentLocation: documentedTypes[code] }
    );

  const referenceIndex = types.findIndex((t) => t.datatype === 'Reference');
  if (referenceIndex >= 0) {
    const referenceTypes =
      type[referenceIndex].targetProfile
        ?.filter((target) => target.includes('/fhir/StructureDefinition/'))
        .map((target) => {
          const datatype = target.split('/').pop() || '';
          return { datatype, documentLocation: documentedTypes[datatype] };
        }) || [];
    return { types, referenceTypes };
  }
  return { types };
}

function getInheritance(property: ElementDefinition): { inherited: boolean; base?: string } {
  const inheritanceBase = property.base?.path?.split('.')[0];
  const inherited = !!inheritanceBase && property.path?.split('.')[0] !== inheritanceBase;
  if (!inherited) {
    return { inherited };
  }
  return { inherited, base: inheritanceBase };
}

function rewriteLinks(description: string): string {
  description = description
    .replace('(operations.html)', '(/api/fhir/operations)')
    .replace('(terminologies.html)', '(https://www.hl7.org/fhir/terminologies.html)');

  // Replace datatype internal links
  const datatypeLinkPattern = /datatypes.html#([a-zA-Z-]+)/g;
  const dtMatches = description.matchAll(datatypeLinkPattern);

  for (const match of dtMatches) {
    if (match[1] in documentedTypes) {
      description = description.replace(match[0], `/api/fhir/datatypes/${match[1].toLowerCase()}`);
    } else {
      description = description.replace(match[0], `https://www.hl7.org/fhir/datatypes.html#${match[1]}`);
    }
  }

  // Replace all the links of [[[Type]]] with internal links
  const typeLinks = Array.from(description.matchAll(/\[\[\[([A-Z][a-z]*)*\]\]\]/gi));
  for (const match of typeLinks) {
    description = description.replace(match[0], `[${match[1]}](./${match[1].toLowerCase()})`);
  }

  return description;
}

function pluralize(location: DocumentationLocation): string {
  if (location !== 'medplum' && location.endsWith('e')) {
    return `${location}s`;
  }
  return location;
}

if (process.argv[1].endsWith('docs.ts')) {
  main();
}

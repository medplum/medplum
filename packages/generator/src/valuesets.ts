import { readJson } from '@medplum/definitions';
import {
  Bundle,
  BundleEntry,
  CodeSystem,
  CodeSystemConcept,
  Resource,
  ValueSet,
  ValueSetCompose,
} from '@medplum/fhirtypes';

const valueSets = new Map<string, CodeSystem | ValueSet>();

export function getValueSetValues(url: string): string[] {
  if (valueSets.size === 0) {
    const files = ['valuesets.json', 'v2-tables.json', 'v3-codesystems.json', 'valuesets-medplum.json'];
    for (const file of files) {
      loadValueSets('fhir/r4/' + file);
    }
  }
  const result: string[] = [];
  buildValueSetValues(url, result);
  return result;
}

function loadValueSets(fileName: string): void {
  const valueSetBundle = readJson(fileName) as Bundle;
  for (const entry of valueSetBundle.entry as BundleEntry[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'CodeSystem' || resource.resourceType === 'ValueSet') {
      valueSets.set(resource.url as string, resource as CodeSystem | ValueSet);
    }
  }
}

function buildValueSetValues(url: string, result: string[]): void {
  // If the url includes a version, remove it
  if (url.includes('|')) {
    url = url.split('|')[0];
  }

  const resource = valueSets.get(url);
  if (!resource) {
    return;
  }

  if (resource.resourceType === 'ValueSet') {
    buildValueSetComposeValues(resource.compose, result);
  }

  if (resource.resourceType === 'CodeSystem') {
    buildCodeSystemConceptValues(resource.concept, result);
  }
}

function buildValueSetComposeValues(compose: ValueSetCompose | undefined, result: string[]): void {
  if (compose?.include) {
    for (const include of compose.include) {
      if (include.concept) {
        for (const concept of include.concept) {
          if (concept.code) {
            result.push(concept.code);
          }
        }
      } else if (include.system) {
        const includedValues = getValueSetValues(include.system);
        if (includedValues) {
          result.push(...includedValues);
        }
      }
    }
  }
}

function buildCodeSystemConceptValues(concepts: CodeSystemConcept[] | undefined, result: string[]): void {
  if (!concepts) {
    return;
  }

  for (const concept of concepts) {
    if (concept.code) {
      result.push(concept.code);
    }
    buildCodeSystemConceptValues(concept.concept, result);
  }
}

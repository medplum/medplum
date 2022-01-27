import { getReferenceString } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';

const resourceTypes = ['Patient', 'Organization', 'Practitioner', 'DiagnosticReport', 'Observation', 'Questionnaire'];

export function main(): void {
  const bundle = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
  for (const entry of bundle.entry as BundleEntry<StructureDefinition>[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' && resourceTypes.includes(resource.id as string)) {
      console.log(getReferenceString(resource));
    }
  }
}

if (process.argv[1].endsWith('storybook.ts')) {
  main();
}

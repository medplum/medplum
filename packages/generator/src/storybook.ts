import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';

const resourceTypes = [
  'Patient',
  'Organization',
  'Practitioner',
  'DiagnosticReport',
  'Observation',
  'Questionnaire',
  'ServiceRequest',
];
const properties = [
  'resourceType',
  'name',
  'description',
  'snapshot',
  'element',
  'id',
  'path',
  'min',
  'max',
  'type',
  'code',
  'targetProfile',
  'binding',
  'valueSet',
  'definition',
];

export function main(): void {
  const bundle = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
  for (const entry of bundle.entry as BundleEntry<StructureDefinition>[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' && resourceTypes.includes(resource.id as string)) {
      console.log(
        `export const ${resource.id}StructureDefinition: StructureDefinition = ` +
          JSON.stringify(resource, keyReplacer, 2) +
          ';\n\n'
      );
    }
  }
}

function keyReplacer(key: string, value: any): any {
  return key === '' || key.match(/\d+/) || properties.includes(key) ? value : undefined;
}

if (process.argv[1].endsWith('storybook.ts')) {
  main();
}

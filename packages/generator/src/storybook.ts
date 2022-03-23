import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, StructureDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const resourceTypes = [
  'Patient',
  'Organization',
  'Practitioner',
  'Encounter',
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
  const output: StructureDefinition[] = [];
  for (const entry of bundle.entry as BundleEntry<StructureDefinition>[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' && resourceTypes.includes(resource.id as string)) {
      output.push(resource);
    }
  }
  console.log(JSON.stringify(output, keyReplacer, 2));
  writeFileSync(
    resolve(__dirname, '../../mock/src/mocks/structuredefinitions.json'),
    JSON.stringify(output, keyReplacer, 2),
    'utf8'
  );
}

function keyReplacer(key: string, value: any): any {
  if (key !== '' && !key.match(/\d+/) && !properties.includes(key)) {
    return undefined;
  }
  return value;
}

if (process.argv[1].endsWith('storybook.ts')) {
  main();
}

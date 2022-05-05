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
  'Specimen',
  'Bot',
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
  const output: StructureDefinition[] = [];
  addStructureDefinitions('fhir/r4/profiles-resources.json', output);
  addStructureDefinitions('fhir/r4/profiles-medplum.json', output);
  console.log(JSON.stringify(output, keyReplacer, 2));
  writeFileSync(
    resolve(__dirname, '../../mock/src/mocks/structuredefinitions.json'),
    JSON.stringify(output, keyReplacer, 2),
    'utf8'
  );
}

function addStructureDefinitions(fileName: string, output: StructureDefinition[]): void {
  const bundle = readJson(fileName) as Bundle<StructureDefinition>;
  for (const entry of bundle.entry as BundleEntry<StructureDefinition>[]) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' && resourceTypes.includes(resource.id as string)) {
      output.push(resource);
    }
  }
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

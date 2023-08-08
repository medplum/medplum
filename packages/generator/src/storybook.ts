import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const resourceTypes = [
  'Address',
  'Patient',
  'Organization',
  'Practitioner',
  'Encounter',
  'DiagnosticReport',
  'Observation',
  'PlanDefinition',
  'ActivityDefinition',
  'Questionnaire',
  'QuestionnaireResponse',
  'ServiceRequest',
  'Specimen',
  'Bot',
  'Project',
  'Communication',
  'SpecimenDefinition',
  'ObservationDefinition',
  'Media',
  'Schedule',
  'Task',
  'Slot',
];

const properties = [
  'resourceType',
  'name',
  'snapshot',
  'element',
  'id',
  'path',
  'min',
  'max',
  'type',
  'code',
  'targetProfile',
  'valueSet',
  'address',
  'city',
  'action',
  'base',
  'expression',
  'component',
  'referenceRange',
  'contentReference',
];

const searchParams = [
  'Patient-name',
  'Patient-birthdate',
  'Patient-organization',
  'Patient-active',
  'individual-telecom',
  'individual-email',
  'individual-phone',
  'individual-address-city',
  'individual-address-state',
  'ServiceRequest-subject',
  'ServiceRequest-authored',
  'Observation-value-quantity',
  'Observation-value-string',
  'Encounter-length',
  'Communication-encounter',
  'Media-encounter',
  'Questionnaire-name',
  'ActivityDefinition-name',
  'Schedule-identifier',
  'Task-identifier',
  'Slot-schedule',
  'Slot-start',
];

export function main(): void {
  writeStructureDefinitions();
  writeSearchParameters();
}

function writeStructureDefinitions(): void {
  const output: StructureDefinition[] = [];
  addStructureDefinitions('fhir/r4/profiles-resources.json', output);
  addStructureDefinitions('fhir/r4/profiles-medplum.json', output);
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

function writeSearchParameters(): void {
  const output: SearchParameter[] = [];
  for (const entry of readJson('fhir/r4/search-parameters.json').entry as BundleEntry<SearchParameter>[]) {
    const resource = entry.resource as SearchParameter;
    if (searchParams.includes(resource.id as string)) {
      output.push(resource);
    }
  }
  for (const entry of readJson('fhir/r4/search-parameters-medplum.json').entry as BundleEntry<SearchParameter>[]) {
    const resource = entry.resource as SearchParameter;
    if (searchParams.includes(resource.id as string)) {
      output.push(resource);
    }
  }
  writeFileSync(
    resolve(__dirname, '../../mock/src/mocks/searchparameters.json'),
    JSON.stringify(output, keyReplacer, 2),
    'utf8'
  );
}

function keyReplacer(key: string, value: any): any {
  if (key !== '' && !/\d+/.exec(key) && !resourceTypes.includes(key) && !properties.includes(key)) {
    return undefined;
  }
  return value;
}

if (process.argv[1].endsWith('storybook.ts')) {
  main();
}

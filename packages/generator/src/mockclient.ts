import { readJson } from '@medplum/definitions';
import { Bundle, BundleEntry, Resource, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  'Communication-part-of',
  'Media-encounter',
  'Questionnaire-name',
  'ActivityDefinition-name',
  'Schedule-identifier',
  'Task-identifier',
  'Slot-schedule',
  'Slot-start',
  'Measure-url',
];

const USCoreStructureDefinitionFiles = [
  'StructureDefinition-us-core-patient.json',
  'StructureDefinition-us-core-race.json',
  'StructureDefinition-us-core-ethnicity.json',
  'StructureDefinition-us-core-birthsex.json',
  'StructureDefinition-us-core-genderIdentity.json',
  'StructureDefinition-us-core-implantable-device.json',
  'StructureDefinition-us-core-blood-pressure.json',
  'StructureDefinition-us-core-medicationrequest.json',
];

const BUILD_USCORE = false;

export function main(): void {
  writeStructureDefinitions();
  writeSearchParameters();

  if (BUILD_USCORE) {
    // To build USCore, download and expand a USCore Implementation Guide package file,
    // such as https://hl7.org/fhir/us/core/STU5.0.1/package.tgz which is linked to
    // from https://hl7.org/fhir/us/core/STU5.0.1/downloads.html
    buildUSCoreStructureDefinitions('/absolute/path/to/expanded/package-file', [
      resolve(__dirname, '../../mock/src/mocks/uscore/uscore-v5.0.1-structuredefinitions.json'),
      resolve(__dirname, '../../definitions/dist/fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json'),
    ]);
  }
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
      removeBaseFromElements(resource);
      output.push(resource);
    }
  }
}

function removeBaseFromElements(sd: StructureDefinition): void {
  for (const element of sd.snapshot?.element ?? []) {
    if (
      element.base &&
      element.path === element.base.path &&
      element.min === element.base.min &&
      element.max === element.base.max
    ) {
      element.base = undefined;
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

if (process.argv[1].endsWith('.ts')) {
  main();
}

// or with jq: jq 'del(.text, .differential, .mapping, .snapshot.element[].mapping)' <input-file.json>
function cleanStructureDefinition(sd: StructureDefinition): void {
  sd.text = undefined;
  sd.differential = undefined;
  sd.mapping = undefined;
  if (sd?.snapshot?.element) {
    for (const element of sd.snapshot.element) {
      element.mapping = undefined;
    }
  }
}

function buildUSCoreStructureDefinitions(inputDirectory: string, outputFilenames: string[]): void {
  const sds = [];
  for (const file of USCoreStructureDefinitionFiles) {
    const sd = JSON.parse(readFileSync(resolve(inputDirectory, file), 'utf8'));
    cleanStructureDefinition(sd);
    sds.push(sd);
  }
  for (const outputFilename of outputFilenames) {
    writeFileSync(outputFilename, JSON.stringify(sds));
  }
}

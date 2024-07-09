import { MockClient } from '@medplum/mock';
import { handler } from './intake-form';
import { intakeResponse } from './test-data/intake-form-test-data';
import { Bundle, Patient, SearchParameter } from '@medplum/fhirtypes';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  getExtensionValue,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  parseReference,
} from '@medplum/core';

describe('Intake form', async () => {
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('update patient demographic information', async () => {
    const medplum = new MockClient();

    const response = await medplum.createResource(intakeResponse);
    const [resourceType, resourceId] = parseReference(response.subject);
    let patient = await medplum.createResource({
      resourceType: resourceType,
      id: resourceId,
    } as Patient);

    await handler({ bot, input: response, contentType, secrets: {} }, medplum);

    patient = await medplum.readResource('Patient', patient.id as string);

    const sexualOrientation = await medplum.searchOne('Observation', {
      code: '76690-7',
      subject: getReferenceString(patient),
    });

    expect(patient.name?.[0].given).toEqual(['FirstName', 'MiddleName']);
    expect(patient.name?.[0].family).toEqual('LastName');
    expect(patient.gender).toEqual('other');
    expect(patient.birthDate).toEqual('2000-01-01');
    expect(getExtensionValue(patient, 'http://terminology.hl7.org/CodeSystem/v3-Race')).toEqual({
      code: '1068-6',
      display: 'Canadian and Latin American Indian',
      system: 'http://terminology.hl7.org/CodeSystem/v3-Race',
    });
    expect(getExtensionValue(patient, 'http://terminology.hl7.org/CodeSystem/v3-Ethnicity')).toEqual({
      code: '2135-2',
      display: 'Hispanic or Latino',
      system: 'http://terminology.hl7.org/CodeSystem/v3-Ethnicity',
    });

    expect(sexualOrientation?.valueCodeableConcept?.coding?.[0].code).toEqual('42035005');
  });
});

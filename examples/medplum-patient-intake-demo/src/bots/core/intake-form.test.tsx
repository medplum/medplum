import { MockClient } from '@medplum/mock';
import { handler } from './intake-form';
import { intakePatient, intakeResponse } from './test-data/intake-form-test-data';
import { Bundle, Patient, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  getExtensionValue,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';

describe('Intake form', async () => {
  let medplum: MockClient, response: QuestionnaireResponse, patient: Patient;
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
    response = await medplum.createResource(intakeResponse);
    patient = await medplum.createResource(intakePatient);
  });

  describe('Update Patient demographic information', async () => {
    test('Patient attributes', async () => {
      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.name?.[0].given).toEqual(['FirstName', 'MiddleName']);
      expect(patient.name?.[0].family).toEqual('LastName');
      expect(patient.gender).toEqual('other');
      expect(patient.birthDate).toEqual('2000-01-01');
    });

    test('Race and etinicity', async () => {
      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

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
    });

    test('Sexual orientation', async () => {
      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

      const sexualOrientation = await medplum.searchOne('Observation', {
        code: '76690-7',
        subject: getReferenceString(patient),
      });

      expect(sexualOrientation?.valueCodeableConcept?.coding?.[0].code).toEqual('42035005');
    });
  });

  describe('Language information', async () => {
    test('add languages', async () => {
      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.communication?.length).toEqual(2);
      expect(patient.communication?.[0].language.coding?.[0].code).toEqual('pt-BR');
      expect(patient.communication?.[1].language.coding?.[0].code).toEqual('en');
      expect(patient.communication?.[1].preferred).toBeTruthy();
    });

    test('does not duplicate existing language', async () => {
      await medplum.updateResource({
        ...patient,
        communication: [
          {
            language: {
              coding: [
                {
                  system: 'urn:ietf:bcp:47',
                  code: 'en',
                  display: 'English',
                },
              ],
            },
          },
        ],
      });

      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.communication?.length).toEqual(2);
    });

    test('sets existing language as preferred', async () => {
      await medplum.updateResource({
        ...patient,
        communication: [
          {
            language: {
              coding: [
                {
                  system: 'urn:ietf:bcp:47',
                  code: 'en',
                  display: 'English',
                },
              ],
            },
          },
        ],
      });

      await handler({ bot, input: response, contentType, secrets: {} }, medplum);

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.communication?.[0].preferred).toBeTruthy();
    });
  });
});

import { MockClient } from '@medplum/mock';
import { handler } from './intake-form';
import {
  intakePatient,
  intakeQuestionnaire,
  intakeResponse,
  payorOrganization1,
  payorOrganization2,
} from './test-data/intake-form-test-data';
import {
  Bundle,
  HumanName,
  Organization,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  SearchParameter,
} from '@medplum/fhirtypes';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  createReference,
  getExtensionValue,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import {
  consentCategoryMapping,
  consentPolicyRuleMapping,
  consentScopeMapping,
  extensionURLMapping,
  findQuestionnaireItem,
} from './intake-utils';

describe('Intake form', async () => {
  let medplum: MockClient,
    response: QuestionnaireResponse,
    patient: Patient,
    payor1: Organization,
    payor2: Organization;
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
    patient = await medplum.createResource(intakePatient);
    payor1 = await medplum.createResource(payorOrganization1);
    payor2 = await medplum.createResource(payorOrganization2);
    await medplum.createResource(intakeQuestionnaire);
    response = await medplum.createResource(intakeResponse);
  });

  describe('Update Patient demographic information', async () => {
    test('Patient attributes', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.name?.[0].given).toEqual(['FirstName', 'MiddleName']);
      expect(patient.name?.[0].family).toEqual('LastName');
      expect(patient.gender).toEqual('33791000087105');
      expect(patient.birthDate).toEqual('2000-01-01');
    });

    test("Doesn't change patient name if not provided", async () => {
      const firstName = findQuestionnaireItem(response.item, 'first-name');
      (firstName as QuestionnaireResponseItem).answer = undefined;
      const middleName = findQuestionnaireItem(response.item, 'middle-name');
      (middleName as QuestionnaireResponseItem).answer = undefined;
      const lastName = findQuestionnaireItem(response.item, 'last-name');
      (lastName as QuestionnaireResponseItem).answer = undefined;

      await medplum.updateResource(response);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.name?.[0].given).toEqual(['John', 'Doe']);
      expect(patient.name?.[0].family).toEqual('Carvalho');
    });

    test("Doesn't add undefined values to patient name", async () => {
      const middleName = findQuestionnaireItem(response.item, 'middle-name');
      (middleName as QuestionnaireResponseItem).answer = undefined;
      const lastName = findQuestionnaireItem(response.item, 'last-name');
      (lastName as QuestionnaireResponseItem).answer = undefined;

      await medplum.updateResource(response);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const patientName = (patient.name as any[])[0] as HumanName;

      expect(patientName.given).toEqual(['FirstName']);
      expect(Object.keys(patientName)).not.toContain('family');
    });

    test('Race and etinicity', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(getExtensionValue(patient, extensionURLMapping.race)).toEqual({
        code: '2131-1',
        display: 'Other Race',
        system: 'urn:oid:2.16.840.1.113883.6.238',
      });
      expect(getExtensionValue(patient, extensionURLMapping.ethnicity)).toEqual({
        code: '2135-2',
        display: 'Hispanic or Latino',
        system: 'urn:oid:2.16.840.1.113883.6.238',
      });
    });
  });

  describe('Language information', async () => {
    test('add languages', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.communication?.length).toEqual(2);
      expect(patient.communication?.[0].language.coding?.[0].code).toEqual('pt');
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

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

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

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(patient.communication?.[0].preferred).toBeTruthy();
    });
  });

  describe('Veteran status', async () => {
    test('sets as veteran', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(getExtensionValue(patient, extensionURLMapping.veteran)).toEqual(true);
    });

    test('overrides existing', async () => {
      await medplum.updateResource({
        ...patient,
        extension: [
          {
            url: extensionURLMapping.veteran,
            valueBoolean: false,
          },
        ],
      });

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      expect(getExtensionValue(patient, extensionURLMapping.veteran)).toEqual(true);
    });
  });

  describe('Observations', async () => {
    test('Sexual orientation', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const observation = await medplum.searchOne('Observation', {
        code: '76690-7',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toEqual('42035005');
    });

    test('Housing status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const observation = await medplum.searchOne('Observation', {
        code: '71802-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toEqual('M');
    });

    test('Education Level', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const observation = await medplum.searchOne('Observation', {
        code: '82589-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toEqual('BD');
    });

    test('Pregnancy Status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const observation = await medplum.searchOne('Observation', {
        code: '82810-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toEqual('77386006');
    });

    test('Estimated Delivery Date', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const observation = await medplum.searchOne('Observation', {
        code: '11778-8',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueDateTime).toEqual('2025-04-01T00:00:00.000Z');
    });
  });

  describe('Coverage', async () => {
    test('adds coverage resources', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const coverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(coverages[0].beneficiary).toEqual(createReference(patient));
      expect(coverages[0].subscriberId).toEqual('first-provider-id');
      expect(coverages[0].relationship?.coding?.[0]?.code).toEqual('BP');
      expect(coverages[0].payor?.[0].reference).toEqual(createReference(payor1).reference);

      expect(coverages[1].beneficiary).toEqual(createReference(patient));
      expect(coverages[1].subscriberId).toEqual('second-provider-id');
      expect(coverages[1].relationship?.coding?.[0]?.code).toEqual('BP');
      expect(coverages[1].payor?.[0].reference).toEqual(createReference(payor2).reference);
    });

    test('upsert coverage resources to ensure there is only one coverage resource per payor', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const coverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(coverages.length).toEqual(2);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      const updatedCoverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(updatedCoverages.length).toEqual(2);
    });
  });

  describe('Consents', async () => {
    test('adds all consent resources', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const consents = await medplum.searchResources('Consent', { patient: getReferenceString(patient) });

      expect(consents.length).toEqual(4);

      expect(consents[0].scope).toEqual(consentScopeMapping.treatment);
      expect(consents[0].category[0]).toEqual(consentCategoryMapping.med);
      expect(consents[0].status).toEqual('active');

      expect(consents[1].scope).toEqual(consentScopeMapping.treatment);
      expect(consents[1].category[0]).toEqual(consentCategoryMapping.pay);
      expect(consents[1].policyRule).toEqual(consentPolicyRuleMapping.hipaaSelfPay);
      expect(consents[1].status).toEqual('active');

      expect(consents[2].scope).toEqual(consentScopeMapping.patientPrivacy);
      expect(consents[2].category[0]).toEqual(consentCategoryMapping.nopp);
      expect(consents[2].policyRule).toEqual(consentPolicyRuleMapping.hipaaNpp);
      expect(consents[2].status).toEqual('active');

      expect(consents[3].scope).toEqual(consentScopeMapping.adr);
      expect(consents[3].category[0]).toEqual(consentCategoryMapping.acd);
      expect(consents[3].status).toEqual('active');
    });

    test('adds rejected consent', async () => {
      const responseItem = findQuestionnaireItem(response.item, 'notice-of-privacy-practices-signature');
      (responseItem as QuestionnaireResponseItem).answer = [];

      await medplum.updateResource(response);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = await medplum.readResource('Patient', patient.id as string);

      const consents = await medplum.searchResources('Consent', { patient: getReferenceString(patient) });

      expect(consents[2].scope).toEqual(consentScopeMapping.patientPrivacy);
      expect(consents[2].category[0]).toEqual(consentCategoryMapping.nopp);
      expect(consents[2].status).toEqual('rejected');
    });
  });
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  Bundle,
  Organization,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './intake-form';
import {
  consentCategoryMapping,
  consentPolicyRuleMapping,
  consentScopeMapping,
  extensionURLMapping,
  findQuestionnaireItem,
  PROFILE_URLS,
} from './intake-utils';
import {
  intakeQuestionnaire,
  intakeResponse,
  payorOrganization1,
  payorOrganization2,
  pharmacyOrganization,
} from './test-data/intake-form-test-data';

describe('Intake form', async () => {
  let medplum: MockClient,
    response: QuestionnaireResponse,
    patient: Patient | undefined,
    payor1: Organization,
    payor2: Organization,
    pharmacy: Organization;
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const ssn = '518225060';

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
    payor1 = await medplum.createResource(payorOrganization1);
    payor2 = await medplum.createResource(payorOrganization2);
    pharmacy = await medplum.createResource(pharmacyOrganization);
    await medplum.createResource(intakeQuestionnaire);
    response = await medplum.createResource(intakeResponse);
  });

  test('Create the patient resource', async () => {
    await handler(medplum, { bot, input: response, contentType, secrets: {} });

    patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

    expect(patient).toBeDefined();
    expect(patient.identifier?.[0].value).toStrictEqual(ssn);
    expect(response.subject).toStrictEqual(createReference(patient));
  });

  describe('Patient demographic information', async () => {
    test('Patient attributes', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();
      expect(patient.meta?.profile).toStrictEqual([PROFILE_URLS.Patient]);
      expect(patient.name?.[0].given).toStrictEqual(['FirstName', 'MiddleName']);
      expect(patient.name?.[0].family).toStrictEqual('LastName');
      expect(patient.gender).toStrictEqual('33791000087105');
      expect(patient.birthDate).toStrictEqual('2000-01-01');
      expect(patient.address?.[0]).toStrictEqual({
        use: 'home',
        type: 'physical',
        line: ['123 Happy St'],
        city: 'Sunnyvale',
        state: 'CA',
        postalCode: '95008',
      });
      expect(patient.telecom?.[0]).toStrictEqual({
        system: 'phone',
        value: '555-555-5555',
      });
      expect(patient.identifier?.[0]).toStrictEqual({
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'SS',
            },
          ],
        },
        system: 'http://hl7.org/fhir/sid/us-ssn',
        value: '518225060',
      });
      expect(patient.contact?.[0]).toStrictEqual({
        relationship: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'EP',
                display: 'Emergency contact person',
              },
            ],
          },
        ],
        name: {
          family: 'Simpson',
          given: ['Marge'],
        },
        telecom: [
          {
            system: 'phone',
            value: '111-222-5555',
          },
        ],
      });
    });

    test('Race, ethnicity, and veteran status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();
      expect(patient.extension).toStrictEqual([
        {
          url: extensionURLMapping.race,
          extension: [
            {
              url: 'ombCategory',
              valueCoding: {
                code: '2131-1',
                display: 'Other Race',
                system: 'urn:oid:2.16.840.1.113883.6.238',
              },
            },
            {
              url: 'text',
              valueString: 'Other Race',
            },
          ],
        },
        {
          url: extensionURLMapping.ethnicity,
          extension: [
            {
              url: 'ombCategory',
              valueCoding: {
                code: '2135-2',
                display: 'Hispanic or Latino',
                system: 'urn:oid:2.16.840.1.113883.6.238',
              },
            },
            {
              url: 'text',
              valueString: 'Hispanic or Latino',
            },
          ],
        },
        {
          url: extensionURLMapping.veteran,
          valueBoolean: true,
        },
      ]);
    });
  });

  describe('Allergies', async () => {
    test('add allergies', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const allergies = await medplum.searchResources('AllergyIntolerance', { patient: getReferenceString(patient) });

      expect(allergies.length).toStrictEqual(2);

      expect(allergies[0].meta?.profile).toStrictEqual([PROFILE_URLS.AllergyIntolerance]);
      expect(allergies[0].code?.coding?.[0].code).toStrictEqual('111088007');
      expect(allergies[0].clinicalStatus?.coding?.[0].code).toStrictEqual('active');
      expect(allergies[0].reaction?.[0].manifestation?.[0].text).toStrictEqual('Skin rash');
      expect(allergies[0].onsetDateTime).toStrictEqual('2000-07-01T00:00:00Z');

      expect(allergies[1]?.meta?.profile).toStrictEqual([PROFILE_URLS.AllergyIntolerance]);
      expect(allergies[1].code?.coding?.[0].code).toStrictEqual('763875007');
      expect(allergies[1].clinicalStatus?.coding?.[0].code).toStrictEqual('active');
      expect(allergies[1].reaction?.[0].manifestation?.[0].text).toStrictEqual('Skin rash');
      expect(allergies[1].onsetDateTime).toStrictEqual('2020-01-01T00:00:00Z');
    });
  });

  describe('Current medications', async () => {
    test('add medications', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const medications = await medplum.searchResources('MedicationRequest', {
        subject: getReferenceString(patient),
      });

      expect(medications.length).toStrictEqual(2);

      expect(medications[0].meta?.profile).toStrictEqual([PROFILE_URLS.MedicationRequest]);
      expect(medications[0].medicationCodeableConcept?.coding?.[0].code).toStrictEqual('1156277');
      expect(medications[0].status).toStrictEqual('active');
      expect(medications[0].note?.[0].text).toStrictEqual('I take it to manage my chronic back pain.');

      expect(medications[1]?.meta?.profile).toStrictEqual([PROFILE_URLS.MedicationRequest]);
      expect(medications[1].medicationCodeableConcept?.coding?.[0].code).toStrictEqual('1161610');
      expect(medications[1].status).toStrictEqual('active');
      expect(medications[1].note?.[0].text).toStrictEqual('I take it to manage my diabetes.');
    });
  });

  describe('Condition', async () => {
    test('add conditions', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const conditions = await medplum.searchResources('Condition', {
        subject: getReferenceString(patient),
      });

      expect(conditions.length).toStrictEqual(2);

      expect(conditions[0].code?.coding?.[0].code).toStrictEqual('59621000');
      expect(conditions[0].code?.coding?.[0].display).toStrictEqual('Essential hypertension (disorder)');
      expect(conditions[0].clinicalStatus?.coding?.[0].code).toStrictEqual('active');
      expect(conditions[0].onsetDateTime).toStrictEqual('2008-05-01T00:00:00.000Z');

      expect(conditions[1].code?.coding?.[0].code).toStrictEqual('44054006');
      expect(conditions[1].code?.coding?.[0].display).toStrictEqual('Diabetes mellitus type 2 (disorder)');
      expect(conditions[1].clinicalStatus?.coding?.[0].code).toStrictEqual('active');
      expect(conditions[1].onsetDateTime).toStrictEqual('2010-03-01T00:00:00.000Z');
    });
  });

  describe('Family Member History', async () => {
    test('add family member history', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const familyMemberHistories = await medplum.searchResources('FamilyMemberHistory', {
        patient: getReferenceString(patient),
      });

      expect(familyMemberHistories.length).toStrictEqual(2);

      expect(familyMemberHistories[0].condition?.[0].code?.coding?.[0].code).toStrictEqual('254843006');
      expect(familyMemberHistories[0].condition?.[0].code?.coding?.[0].display).toStrictEqual(
        'Familial cancer of breast (disorder)'
      );
      expect(familyMemberHistories[0].relationship?.coding?.[0].code).toStrictEqual('MTH');
      expect(familyMemberHistories[0].relationship?.coding?.[0].display).toStrictEqual('mother');
      expect(familyMemberHistories[0].deceasedBoolean).toStrictEqual(false);

      expect(familyMemberHistories[1].condition?.[0].code?.coding?.[0].code).toStrictEqual('53741008');
      expect(familyMemberHistories[1].condition?.[0].code?.coding?.[0].display).toStrictEqual(
        'Coronary arteriosclerosis (disorder)'
      );
      expect(familyMemberHistories[1].relationship?.coding?.[0].code).toStrictEqual('FTH');
      expect(familyMemberHistories[1].relationship?.coding?.[0].display).toStrictEqual('father');
      expect(familyMemberHistories[1].deceasedBoolean).toStrictEqual(true);
    });
  });

  describe('Immunization', async () => {
    test('add immunizations', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const immunizations = await medplum.searchResources('Immunization', {
        patient: getReferenceString(patient),
      });

      expect(immunizations.length).toStrictEqual(2);

      expect(immunizations[0].meta?.profile).toStrictEqual([PROFILE_URLS.Immunization]);
      expect(immunizations[0].vaccineCode?.coding?.[0].system).toStrictEqual('http://hl7.org/fhir/sid/cvx');
      expect(immunizations[0].vaccineCode?.coding?.[0].code).toStrictEqual('197');
      expect(immunizations[0].status).toStrictEqual('completed');
      expect(immunizations[0].occurrenceDateTime).toStrictEqual('2024-02-01T14:00:00-07:00');

      expect(immunizations[1].meta?.profile).toStrictEqual([PROFILE_URLS.Immunization]);
      expect(immunizations[1].vaccineCode?.coding?.[0].system).toStrictEqual('http://hl7.org/fhir/sid/cvx');
      expect(immunizations[1].vaccineCode?.coding?.[0].code).toStrictEqual('115');
      expect(immunizations[1].status).toStrictEqual('completed');
      expect(immunizations[1].occurrenceDateTime).toStrictEqual('2015-08-01T15:00:00-07:00');
    });
  });

  describe('Language information', async () => {
    test('add languages', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();
      expect(patient.communication?.length).toStrictEqual(2);
      expect(patient.communication?.[0].language.coding?.[0].code).toStrictEqual('pt');
      expect(patient.communication?.[1].language.coding?.[0].code).toStrictEqual('en');
      expect(patient.communication?.[1].preferred).toBeTruthy();
    });
  });

  describe('Observations', async () => {
    test('Sexual orientation', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '76690-7',
        subject: getReferenceString(patient),
      });

      expect(observation).toBeDefined();
      expect(observation?.meta?.profile).toStrictEqual([PROFILE_URLS.ObservationSexualOrientation]);
      expect(observation?.valueCodeableConcept?.coding?.[0].code).toStrictEqual('42035005');
    });

    test('Housing status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '71802-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toStrictEqual('M');
    });

    test('Smoking status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '72166-2',
        subject: getReferenceString(patient),
      });

      expect(observation).toBeDefined();
      expect(observation?.meta?.profile).toStrictEqual([PROFILE_URLS.ObservationSmokingStatus]);
      expect(observation?.valueCodeableConcept?.coding?.[0].code).toStrictEqual('428041000124106');
    });

    test('Education Level', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '82589-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toStrictEqual('BD');
    });

    test('Pregnancy Status', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '82810-3',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueCodeableConcept?.coding?.[0].code).toStrictEqual('77386006');
    });

    test('Estimated Delivery Date', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const observation = await medplum.searchOne('Observation', {
        code: '11778-8',
        subject: getReferenceString(patient),
      });

      expect(observation?.valueDateTime).toStrictEqual('2025-04-01T00:00:00.000Z');
    });
  });

  describe('CareTeam', async () => {
    test('Preferred Pharmacy', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const careTeam = await medplum.searchResources('CareTeam', {
        subject: getReferenceString(patient),
      });

      expect(careTeam.length).toStrictEqual(1);
      expect(careTeam[0].meta?.profile).toStrictEqual([PROFILE_URLS.CareTeam]);
      expect(careTeam[0].status).toStrictEqual('proposed');
      expect(careTeam[0].name).toStrictEqual('Patient Preferred Pharmacy');
      expect(careTeam[0].participant?.length).toStrictEqual(1);
      expect(careTeam[0].participant?.[0].member?.reference).toStrictEqual(getReferenceString(pharmacy));
    });
  });

  describe('Coverage', async () => {
    test('adds coverage resources', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const coverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(coverages.length).toStrictEqual(2);

      expect(coverages[0].meta?.profile).toStrictEqual([PROFILE_URLS.Coverage]);
      expect(coverages[0].beneficiary).toStrictEqual(createReference(patient));
      expect(coverages[0].subscriberId).toStrictEqual('first-provider-id');
      expect(coverages[0].relationship?.coding?.[0]?.code).toStrictEqual('self');
      expect(coverages[0].payor?.[0].reference).toStrictEqual(getReferenceString(payor1));

      expect(coverages[1].meta?.profile).toStrictEqual([PROFILE_URLS.Coverage]);
      expect(coverages[1].beneficiary).toStrictEqual(createReference(patient));
      expect(coverages[1].subscriberId).toStrictEqual('second-provider-id');
      expect(coverages[1].relationship?.coding?.[0]?.code).toStrictEqual('child');
      expect(coverages[1].payor?.[0].reference).toStrictEqual(getReferenceString(payor2));
    });

    test('upsert coverage resources to ensure there is only one coverage resource per payor', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const coverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(coverages.length).toStrictEqual(2);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      const updatedCoverages = await medplum.searchResources('Coverage', { beneficiary: getReferenceString(patient) });

      expect(updatedCoverages.length).toStrictEqual(2);
    });

    test('create RelatedPerson resource for subscriber', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const relatedPerson = await medplum.searchResources('RelatedPerson', {
        patient: getReferenceString(patient),
      });

      expect(relatedPerson.length).toStrictEqual(1);
      expect(relatedPerson[0].relationship?.[0]).toStrictEqual({
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: 'PRN',
            display: 'parent',
          },
        ],
      });
      expect(relatedPerson[0].name).toStrictEqual([
        {
          family: 'Simpson',
          given: ['Marge'],
        },
      ]);
      expect(relatedPerson[0].birthDate).toStrictEqual('1958-03-19');
      expect(relatedPerson[0].gender).toStrictEqual('446141000124107');
    });
  });

  describe('Consents', async () => {
    test('adds all consent resources', async () => {
      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const consents = await medplum.searchResources('Consent', { patient: getReferenceString(patient) });

      expect(consents.length).toStrictEqual(4);

      expect(consents[0].scope).toStrictEqual(consentScopeMapping.treatment);
      expect(consents[0].category[0]).toStrictEqual(consentCategoryMapping.med);
      expect(consents[0].status).toStrictEqual('active');

      expect(consents[1].scope).toStrictEqual(consentScopeMapping.treatment);
      expect(consents[1].category[0]).toStrictEqual(consentCategoryMapping.pay);
      expect(consents[1].policyRule).toStrictEqual(consentPolicyRuleMapping.hipaaSelfPay);
      expect(consents[1].status).toStrictEqual('active');

      expect(consents[2].scope).toStrictEqual(consentScopeMapping.patientPrivacy);
      expect(consents[2].category[0]).toStrictEqual(consentCategoryMapping.nopp);
      expect(consents[2].policyRule).toStrictEqual(consentPolicyRuleMapping.hipaaNpp);
      expect(consents[2].status).toStrictEqual('active');

      expect(consents[3].scope).toStrictEqual(consentScopeMapping.adr);
      expect(consents[3].category[0]).toStrictEqual(consentCategoryMapping.acd);
      expect(consents[3].status).toStrictEqual('active');
    });

    test('adds rejected consent', async () => {
      const responseItem = findQuestionnaireItem(response.item, 'notice-of-privacy-practices-signature');
      (responseItem as QuestionnaireResponseItem).answer = [];

      await medplum.updateResource(response);

      await handler(medplum, { bot, input: response, contentType, secrets: {} });

      patient = (await medplum.searchOne('Patient', `identifier=${ssn}`)) as Patient;

      expect(patient).toBeDefined();

      const consents = await medplum.searchResources('Consent', { patient: getReferenceString(patient) });

      expect(consents[2].scope).toStrictEqual(consentScopeMapping.patientPrivacy);
      expect(consents[2].category[0]).toStrictEqual(consentCategoryMapping.nopp);
      expect(consents[2].status).toStrictEqual('rejected');
    });
  });
});

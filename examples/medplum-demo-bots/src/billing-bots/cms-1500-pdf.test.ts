import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Address, Bundle, Claim, Coverage, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  getAddressContent,
  getCoverageInfo,
  getPatientInfo,
  getPatientRelationshipToInsuredContent,
  getPhoneContent,
  handler,
} from './cms-1500-pdf';
import { fullAnswer } from './cms-1500-test-data';

describe('CMS 1500 PDF Bot', async () => {
  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
  });

  test('Fully answered CMS1500 pdf', async () => {
    await medplum.executeBatch(fullAnswer);

    const claim = (await medplum.searchOne('Claim', {
      identifier: 'example-claim-cms1500',
    })) as Claim;

    const response = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: claim,
      secrets: {},
      contentType: 'application/fhir+json',
    });

    expect(response).toBeDefined();
    expect(response.resourceType).toStrictEqual('Media');
    expect(response.content.contentType).toStrictEqual('application/pdf');
  });

  test('getPatientInfo', async () => {
    const patient = (fullAnswer.entry?.[0]?.resource as Patient) ?? {};

    const patientInfo = getPatientInfo(patient);

    expect(patientInfo.patientName).toStrictEqual('Homer Simpson');
    expect(patientInfo.patientSex).toStrictEqual('male');
    expect(patientInfo.patientDob).toStrictEqual('5/12/1956');
    expect(patientInfo.patientAddress).toStrictEqual('742 Evergreen Terrace, Springfield, IL, 62704');
    expect(patientInfo.patientPhone).toStrictEqual('555-555-6392');
  });

  test('getPhoneContent', () => {
    const result = getPhoneContent('555-325-1111');
    expect(result).toStrictEqual([
      { text: '555', absolutePosition: { x: 123, y: 204 }, fontSize: 9 },
      {
        text: '325-1111',
        absolutePosition: { x: 150, y: 204 },
        fontSize: 9,
      },
    ]);

    const result2 = getPhoneContent('(555) 325-2222');
    expect(result2).toStrictEqual([
      { text: '555', absolutePosition: { x: 123, y: 204 }, fontSize: 9 },
      {
        text: '325-2222',
        absolutePosition: { x: 150, y: 204 },
        fontSize: 9,
      },
    ]);

    const result3 = getPhoneContent('5553253333');
    expect(result3).toStrictEqual([
      { text: '555', absolutePosition: { x: 123, y: 204 }, fontSize: 9 },
      {
        text: '325-3333',
        absolutePosition: { x: 150, y: 204 },
        fontSize: 9,
      },
    ]);
  });

  test('getCoverageInfo', () => {
    const coverage = fullAnswer.entry?.[4]?.resource as Coverage;

    const result = getCoverageInfo(coverage);

    expect(result.insuranceType).toStrictEqual('health insurance plan policy');
    expect(result.insuredIdNumber).toStrictEqual('89442808');
    expect(result.relationship).toStrictEqual('Spouse');
    expect(result.coverageName).toStrictEqual('Independence Blue Cross Blue Shield');
  });

  test('getPatientRelationshipToInsuredContent', () => {
    const resultSelf = getPatientRelationshipToInsuredContent('self');
    expect(resultSelf).toStrictEqual([{ text: 'X', absolutePosition: { x: 252, y: 156 }, fontSize: 9 }]);

    const resultSpouse = getPatientRelationshipToInsuredContent('spouse');
    expect(resultSpouse).toStrictEqual([{ text: 'X', absolutePosition: { x: 289, y: 156 }, fontSize: 9 }]);

    const resultChild = getPatientRelationshipToInsuredContent('child');
    expect(resultChild).toStrictEqual([{ text: 'X', absolutePosition: { x: 317, y: 156 }, fontSize: 9 }]);

    const resultOther1 = getPatientRelationshipToInsuredContent('other');
    expect(resultOther1).toStrictEqual([{ text: 'X', absolutePosition: { x: 353, y: 156 }, fontSize: 9 }]);

    const resultOther2 = getPatientRelationshipToInsuredContent('parent');
    expect(resultOther2).toStrictEqual([{ text: 'X', absolutePosition: { x: 353, y: 156 }, fontSize: 9 }]);
  });

  test('getAddressContent', () => {
    const address: Address = {
      line: ['742 Evergreen Terrace'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
    };

    const result1 = getAddressContent(address);
    expect(result1).toStrictEqual([
      {
        text: ['742 Evergreen Terrace'],
        absolutePosition: { x: 22, y: 156 },
        fontSize: 9,
      },
      {
        text: 'Springfield',
        absolutePosition: { x: 22, y: 179 },
        fontSize: 9,
      },
      { text: 'IL', absolutePosition: { x: 203, y: 179 }, fontSize: 9 },
      { text: '62704', absolutePosition: { x: 22, y: 204 }, fontSize: 9 },
    ]);

    const result2 = getAddressContent(address, 100);
    expect(result2).toStrictEqual([
      {
        text: ['742 Evergreen Terrace'],
        absolutePosition: { x: 100, y: 156 },
        fontSize: 9,
      },
      {
        text: 'Springfield',
        absolutePosition: { x: 100, y: 179 },
        fontSize: 9,
      },
      { text: 'IL', absolutePosition: { x: 281, y: 179 }, fontSize: 9 },
      { text: '62704', absolutePosition: { x: 100, y: 204 }, fontSize: 9 },
    ]);
  });

  // test('Insurer is not an organization', async () => {
  //   const insurerInfo = getInsurerInfo({
  //     resourceType: 'Patient',
  //   });

  //   expect(insurerInfo.serviceNPI).toBe('');
  //   expect(insurerInfo.serviceLocation).toBe('');
  //   expect(insurerInfo.fedTaxNumber).toBe('');
  //   expect(insurerInfo.fedTaxType).toBe('');
  // });

  // test('Referrer is not a practitioner or organization', async () => {
  //   const patientReferralInfo = getReferralInfo({
  //     resourceType: 'Patient',
  //   });
  //   const organizationReferralInfo = getReferralInfo({
  //     resourceType: 'Organization',
  //     name: 'Referrer',
  //     identifier: [
  //       {
  //         type: {
  //           coding: [{ code: 'NPI' }],
  //         },
  //         value: 'org-npi-code',
  //       },
  //     ],
  //   });
  //   const practitionerReferralInfo = getReferralInfo({
  //     resourceType: 'Practitioner',
  //     name: [{ given: ['Kevin'], family: 'Smith' }],
  //     identifier: [
  //       {
  //         type: {
  //           coding: [{ code: 'NPI' }],
  //         },
  //         value: 'practitioner-npi-code',
  //       },
  //     ],
  //   });

  //   expect(patientReferralInfo.referrerName).toBe('');
  //   expect(patientReferralInfo.referrerNpi).toBe('');
  //   expect(organizationReferralInfo.referrerName).toBe('Referrer');
  //   expect(organizationReferralInfo.referrerNpi).toBe('org-npi-code');
  //   expect(practitionerReferralInfo.referrerName).toBe('Kevin Smith');
  //   expect(practitionerReferralInfo.referrerNpi).toBe('practitioner-npi-code');
  // });

  // test('Practitioner Role for provider', async () => {
  //   const providerInfo = getProviderInfo({
  //     resourceType: 'PractitionerRole',
  //   });

  //   expect(providerInfo.billingLocation).toBe('');
  //   expect(providerInfo.billingPhoneNumber).toBe('');
  //   expect(providerInfo.providerNpi).toBe('');
  // });
});

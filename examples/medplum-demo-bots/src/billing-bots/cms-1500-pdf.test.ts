import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Claim, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { getPatientInfo, getPatientPhoneContent, handler } from './cms-1500-pdf';
import { fullAnswer } from './cms-1500-test-data';
import { ContentText } from 'pdfmake/interfaces';

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
    expect(patientInfo.patientAddress).toStrictEqual('742 Evergreen Terrace, Springfield, IL');
    expect(patientInfo.patientPhone).toStrictEqual('555-555-6392');
  });

  test('getPatientPhoneContent', () => {
    const result = getPatientPhoneContent('555-325-1111');
    expect((result[0] as ContentText).text).toStrictEqual('555');
    expect((result[1] as ContentText).text).toStrictEqual('325-1111');

    const result2 = getPatientPhoneContent('(555) 325-2222');
    expect((result2[0] as ContentText).text).toStrictEqual('555');
    expect((result2[1] as ContentText).text).toStrictEqual('325-2222');

    const result3 = getPatientPhoneContent('5553253333');
    expect((result3[0] as ContentText).text).toStrictEqual('555');
    expect((result3[1] as ContentText).text).toStrictEqual('325-3333');
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

import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Claim, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { getInsurerInfo, getPatientInfo, getProviderInfo, getReferralInfo, handler } from './cms-1500';
import { fullAnswer } from './cms-1500-test-data';

const medplum = new MockClient();

describe('CMS 1500 tests', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Fully answered CMS1500', async () => {
    const result = await medplum.executeBatch(fullAnswer);
    console.log(result);
    const claim = (await medplum.searchOne('Claim', {
      identifier: 'example-claim',
    })) as Claim;

    const response = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: claim,
      secrets: {},
      contentType: 'application/fhir+json',
    });

    expect(response).toBeDefined();
    expect(response.resourceType).toBe('DocumentReference');
  });

  test('Get patient info', async () => {
    const patientInfo = getPatientInfo({
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
      gender: 'male',
    });

    expect(patientInfo.patientName).toBe('Homer Simpson');
    expect(patientInfo.patientSex).toBe('male');
    expect(patientInfo.patientDob).toBe('');
    expect(patientInfo.patientAddress).toBe('');
  });

  test('Insurer is not an organization', async () => {
    const insurerInfo = getInsurerInfo({
      resourceType: 'Patient',
    });

    expect(insurerInfo.serviceNPI).toBe('');
    expect(insurerInfo.serviceLocation).toBe('');
    expect(insurerInfo.fedTaxNumber).toBe('');
    expect(insurerInfo.fedTaxType).toBe('');
  });

  test('Referrer is not a practitioner or organization', async () => {
    const patientReferralInfo = getReferralInfo({
      resourceType: 'Patient',
    });
    const organizationReferralInfo = getReferralInfo({
      resourceType: 'Organization',
      name: 'Referrer',
      identifier: [
        {
          type: {
            coding: [{ code: 'NPI' }],
          },
          value: 'org-npi-code',
        },
      ],
    });
    const practitionerReferralInfo = getReferralInfo({
      resourceType: 'Practitioner',
      name: [{ given: ['Kevin'], family: 'Smith' }],
      identifier: [
        {
          type: {
            coding: [{ code: 'NPI' }],
          },
          value: 'practitioner-npi-code',
        },
      ],
    });

    expect(patientReferralInfo.referrerName).toBe('');
    expect(patientReferralInfo.referrerNpi).toBe('');
    expect(organizationReferralInfo.referrerName).toBe('Referrer');
    expect(organizationReferralInfo.referrerNpi).toBe('org-npi-code');
    expect(practitionerReferralInfo.referrerName).toBe('Kevin Smith');
    expect(practitionerReferralInfo.referrerNpi).toBe('practitioner-npi-code');
  });

  test('Practitioner Role for provider', async () => {
    const providerInfo = getProviderInfo({
      resourceType: 'PractitionerRole',
    });

    expect(providerInfo.billingLocation).toBe('');
    expect(providerInfo.billingPhoneNumber).toBe('');
    expect(providerInfo.providerNpi).toBe('');
  });
});

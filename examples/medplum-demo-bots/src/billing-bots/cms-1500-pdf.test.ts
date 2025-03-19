import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  Address,
  Bundle,
  Claim,
  Coverage,
  HumanName,
  Patient,
  RelatedPerson,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  formatHumanName,
  getAddressContent,
  getCoverageInfo,
  getDOBContent,
  getPatientRelationshipToInsuredContent,
  getPersonInfo,
  getPhoneContent,
  getSexContent,
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

describe('formatHumanName', () => {
  test('formats full name with middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael');
  });

  test('formats name without middle name', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John'],
    };
    expect(formatHumanName(name)).toBe('Smith, John');
  });

  test('formats multiple middle names', () => {
    const name: HumanName = {
      family: 'Smith',
      given: ['John', 'Michael', 'Robert'],
    };
    expect(formatHumanName(name)).toBe('Smith, John, Michael Robert');
  });

  test('formats family name only', () => {
    const name: HumanName = {
      family: 'Smith',
    };
    expect(formatHumanName(name)).toBe('Smith');
  });

  test('formats given names only', () => {
    const name: HumanName = {
      given: ['John', 'Michael'],
    };
    expect(formatHumanName(name)).toBe('John, Michael');
  });

  test('handles empty name', () => {
    const name: HumanName = {};
    expect(formatHumanName(name)).toBe('');
  });

  test('handles undefined fields', () => {
    const name: HumanName = {
      family: undefined,
      given: undefined,
    };
    expect(formatHumanName(name)).toBe('');
  });
});

describe('getPersonInfo', () => {
  test('returns complete person info when all Patient fields are present', () => {
    const patient = (fullAnswer.entry?.[0]?.resource as Patient) ?? {};

    const patientInfo = getPersonInfo(patient);

    expect(patientInfo).toStrictEqual({
      personName: 'Simpson, Homer',
      personGender: 'male',
      personDob: '5/12/1956',
      personAddress: '742 Evergreen Terrace, Springfield, IL, 62704',
      personPhone: '555-555-6392',
    });
  });

  test('returns complete person info when all RelatedPerson fields are present', () => {
    const relatedPerson = (fullAnswer.entry?.[1]?.resource as RelatedPerson) ?? {};

    const relatedPersonInfo = getPersonInfo(relatedPerson);

    expect(relatedPersonInfo).toStrictEqual({
      personName: 'Simpson, Marge',
      personGender: 'female',
      personDob: '8/12/1960',
      personAddress: '742 Evergreen Terrace, Springfield, IL, 62704',
      personPhone: '555-555-6393',
    });
  });

  test('returns empty strings when person is undefined', () => {
    const patientInfo = getPersonInfo(undefined);

    expect(patientInfo).toStrictEqual({
      personName: '',
      personDob: '',
      personGender: '',
      personAddress: '',
      personPhone: '',
    });
  });

  test('handles missing optional fields', () => {
    const partialPatient: Patient = {
      resourceType: 'Patient',
      name: [
        {
          given: ['Homer'],
          family: 'Simpson',
        },
      ],
      gender: 'male',
    };

    const patientInfo = getPersonInfo(partialPatient);

    expect(patientInfo).toStrictEqual({
      personName: 'Simpson, Homer',
      personDob: '',
      personGender: 'male',
      personAddress: '',
      personPhone: '',
    });
  });
});

describe('getCoverageInfo', () => {
  test('returns complete coverage info when all Coverage fields are present', () => {
    const coverage = fullAnswer.entry?.[4]?.resource as Coverage;

    const result = getCoverageInfo(coverage);

    expect(result.insuranceType).toStrictEqual('health insurance plan policy');
    expect(result.insuredIdNumber).toStrictEqual('89442808');
    expect(result.relationship).toStrictEqual('Spouse');
    expect(result.coverageName).toStrictEqual('Independence Blue Cross Blue Shield');
  });

  test('handles missing optional fields', () => {
    const partialCoverage: Coverage = {
      resourceType: 'Coverage',
      status: 'active',
      payor: [{ reference: 'Organization/123' }],
      beneficiary: { reference: 'Patient/123' },
    };

    const result = getCoverageInfo(partialCoverage);

    expect(result).toStrictEqual({
      insuranceType: '',
      insuredIdNumber: '',
      relationship: '',
      coverageName: '',
    });
  });
});

describe('getPhoneContent', () => {
  const expectedPosition = { x: 123, y: 204 };
  const expectedSecondPosition = { x: 150, y: 204 };
  const expectedFontSize = 9;

  test('handles hyphenated phone number format XXX-XXX-XXXX', () => {
    const result = getPhoneContent('555-325-1111');
    expect(result).toStrictEqual([
      { text: '555', absolutePosition: expectedPosition, fontSize: expectedFontSize },
      { text: '325-1111', absolutePosition: expectedSecondPosition, fontSize: expectedFontSize },
    ]);
  });

  test('handles parentheses phone number format (XXX) XXX-XXXX', () => {
    const result = getPhoneContent('(555) 325-2222');
    expect(result).toStrictEqual([
      { text: '555', absolutePosition: expectedPosition, fontSize: expectedFontSize },
      { text: '325-2222', absolutePosition: expectedSecondPosition, fontSize: expectedFontSize },
    ]);
  });

  test('handles plain number format XXXXXXXXXX', () => {
    const result = getPhoneContent('5553253333');
    expect(result).toStrictEqual([
      { text: '555', absolutePosition: expectedPosition, fontSize: expectedFontSize },
      { text: '325-3333', absolutePosition: expectedSecondPosition, fontSize: expectedFontSize },
    ]);
  });

  test('uses custom xAxisOffset', () => {
    const result = getPhoneContent('5553253333', 100);
    expect(result).toStrictEqual([
      { text: '555', absolutePosition: { x: 100, y: 204 }, fontSize: expectedFontSize },
      { text: '325-3333', absolutePosition: { x: 127, y: 204 }, fontSize: expectedFontSize },
    ]);
  });
});

describe('getAddressContent', () => {
  const sampleAddress: Address = {
    line: ['742 Evergreen Terrace'],
    city: 'Springfield',
    state: 'IL',
    postalCode: '62704',
  };

  const defaultXOffset = 22;
  const stateXOffset = 203;
  const expectedFontSize = 9;

  test('returns complete address content', () => {
    const result = getAddressContent(sampleAddress);
    expect(result).toStrictEqual([
      {
        text: ['742 Evergreen Terrace'],
        absolutePosition: { x: defaultXOffset, y: 156 },
        fontSize: expectedFontSize,
      },
      {
        text: 'Springfield',
        absolutePosition: { x: defaultXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: 'IL',
        absolutePosition: { x: stateXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: '62704',
        absolutePosition: { x: defaultXOffset, y: 204 },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('handles missing optional fields', () => {
    const partialAddress: Address = {};

    const result = getAddressContent(partialAddress);
    expect(result).toStrictEqual([
      {
        text: '',
        absolutePosition: { x: defaultXOffset, y: 156 },
        fontSize: expectedFontSize,
      },
      {
        text: '',
        absolutePosition: { x: defaultXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: '',
        absolutePosition: { x: stateXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: '',
        absolutePosition: { x: defaultXOffset, y: 204 },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('uses custom xAxisOffset', () => {
    const customXOffset = 100;
    const customStateXOffset = 281;

    const result = getAddressContent(sampleAddress, customXOffset);
    expect(result).toStrictEqual([
      {
        text: ['742 Evergreen Terrace'],
        absolutePosition: { x: customXOffset, y: 156 },
        fontSize: expectedFontSize,
      },
      {
        text: 'Springfield',
        absolutePosition: { x: customXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: 'IL',
        absolutePosition: { x: customStateXOffset, y: 179 },
        fontSize: expectedFontSize,
      },
      {
        text: '62704',
        absolutePosition: { x: customXOffset, y: 204 },
        fontSize: expectedFontSize,
      },
    ]);
  });
});

describe('getDOBContent', () => {
  const expectedFontSize = 9;

  test('handles date with custom offsets', () => {
    const dob = new Date('1956-05-12');
    const xOffset = 395;
    const yOffset = 253;

    const result = getDOBContent(dob, xOffset, yOffset);

    expect(result).toStrictEqual([
      {
        text: '12',
        absolutePosition: { x: xOffset, y: yOffset },
        fontSize: expectedFontSize,
      },
      {
        text: '05',
        absolutePosition: { x: xOffset + 21, y: yOffset },
        fontSize: expectedFontSize,
      },
      {
        text: '56',
        absolutePosition: { x: xOffset + 42, y: yOffset },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('handles date with default offsets', () => {
    const dob = new Date('1956-05-12');
    const defaultXOffset = 236;
    const defaultYOffset = 131;

    const result = getDOBContent(dob);

    expect(result).toStrictEqual([
      {
        text: '12',
        absolutePosition: { x: defaultXOffset, y: defaultYOffset },
        fontSize: expectedFontSize,
      },
      {
        text: '05',
        absolutePosition: { x: defaultXOffset + 21, y: defaultYOffset },
        fontSize: expectedFontSize,
      },
      {
        text: '56',
        absolutePosition: { x: defaultXOffset + 42, y: defaultYOffset },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('returns empty array for undefined date', () => {
    const result = getDOBContent(undefined);
    expect(result).toStrictEqual([]);
  });
});

describe('getSexContent', () => {
  const expectedMark = { text: 'X', fontSize: 9 };

  test('marks male checkbox', () => {
    const result = getSexContent('male');
    expect(result).toStrictEqual([
      {
        ...expectedMark,
        absolutePosition: { x: 316, y: 131 },
      },
    ]);
  });

  test('marks female checkbox', () => {
    const result = getSexContent('female');
    expect(result).toStrictEqual([
      {
        ...expectedMark,
        absolutePosition: { x: 352, y: 131 },
      },
    ]);
  });

  test('handles custom offsets', () => {
    const result = getSexContent('female', 500, 51, 205);
    expect(result).toStrictEqual([
      {
        ...expectedMark,
        absolutePosition: { x: 551, y: 205 },
      },
    ]);
  });

  test('returns empty array for unknown sex', () => {
    expect(getSexContent('unknown')).toStrictEqual([]);
  });
});

describe('getPatientRelationshipToInsuredContent', () => {
  const expectedFontSize = 9;
  const expectedY = 156;
  const expectedMark = 'X';

  test('marks self checkbox', () => {
    const result = getPatientRelationshipToInsuredContent('self');
    expect(result).toStrictEqual([
      {
        text: expectedMark,
        absolutePosition: { x: 252, y: expectedY },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('marks spouse checkbox', () => {
    const result = getPatientRelationshipToInsuredContent('spouse');
    expect(result).toStrictEqual([
      {
        text: expectedMark,
        absolutePosition: { x: 289, y: expectedY },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('marks child checkbox', () => {
    const result = getPatientRelationshipToInsuredContent('child');
    expect(result).toStrictEqual([
      {
        text: expectedMark,
        absolutePosition: { x: 317, y: expectedY },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('marks other checkbox when relationship is other', () => {
    const result = getPatientRelationshipToInsuredContent('other');
    expect(result).toStrictEqual([
      {
        text: expectedMark,
        absolutePosition: { x: 353, y: expectedY },
        fontSize: expectedFontSize,
      },
    ]);
  });

  test('marks other checkbox when relationship is not recognized', () => {
    const result = getPatientRelationshipToInsuredContent('something');
    expect(result).toStrictEqual([
      {
        text: expectedMark,
        absolutePosition: { x: 353, y: expectedY },
        fontSize: expectedFontSize,
      },
    ]);
  });
});

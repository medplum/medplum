import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import {
  Address,
  Bundle,
  Claim,
  ClaimItem,
  Coverage,
  HumanName,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import {
  formatHumanName,
  getAddressContent,
  getClaimInfo,
  getClaimItemInfo,
  getCoverageInfo,
  getDateContent,
  getInsurerInfo,
  getPatientRelationshipToInsuredContent,
  getPersonInfo,
  getPhoneContent,
  getProviderInfo,
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
    const patient = fullAnswer.entry?.[0]?.resource as Patient;

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
    const relatedPerson = fullAnswer.entry?.[1]?.resource as RelatedPerson;

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
    const coverage = fullAnswer.entry?.[6]?.resource as Coverage;

    const result = getCoverageInfo(coverage);

    expect(result).toStrictEqual({
      insuranceType: 'health insurance plan policy',
      insuredIdNumber: '89442808',
      relationship: 'Spouse',
      coverageName: 'Independence Blue Cross Blue Shield',
      coveragePolicy: 'plan',
      coveragePolicyName: 'Independence Blue Full Coverage',
    });
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
      coveragePolicy: '',
      coveragePolicyName: '',
    });
  });

  test('returns empty strings when coverage is undefined', () => {
    const result = getCoverageInfo(undefined);

    expect(result).toStrictEqual({
      insuranceType: '',
      insuredIdNumber: '',
      relationship: '',
      coverageName: '',
      coveragePolicy: '',
      coveragePolicyName: '',
    });
  });
});

describe('getClaimInfo', () => {
  const claim: Claim = {
    resourceType: 'Claim',
    status: 'active',
    use: 'claim',
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/claim-type',
          code: 'professional',
        },
      ],
    },
    created: '2024-03-30',
    provider: { reference: 'Practitioner/123' },
    priority: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/processpriority',
          code: 'normal',
        },
      ],
    },
    insurance: [],
    patient: { reference: 'Patient/123' },
  };

  test('returns complete claim info from full answer data', () => {
    const claim = fullAnswer.entry?.[8]?.resource as Claim;
    const result = getClaimInfo(claim);

    expect(result).toEqual({
      relatedToemployment: true,
      relatedToAutoAccident: true,
      accidentLocation: '39 Green Lane, Wichita, KS',
      accidentLocationState: 'KS',
      relatedToOtherAccident: false,
      dateOfCurrentIllness: '2/2/2024',
      employmentImpactedEnd: '2024-04-20',
      employmentImpactedStart: '2024-04-02',
      hospitalizationEnd: '5/21/2024',
      hospitalizationStart: '3/30/2024',
      priorAuthRefNumber: '0923092390',
      outsideLab: true,
      outsideLabCharges: '125 USD',
      resubmissionCode: 'Prior Claim',
      originalReference: '',
      patientAccountNumber: '429802409',
      patientPaid: '320 USD',
      totalCharge: '$1,000.00',
      items: [
        {
          charges: '$1,000.00',
          dateOfService: '4/14/2024',
          daysOrUnits: '20 days',
          diagnosisPointer: '1',
          emergency: true,
          familyPlanIndicator: '',
          modifiers: 'None',
          placeOfService: '289 Johnson Street, Ames, IA',
          placeOfServiceState: 'IA',
          procedureCode: 'Exam, recall',
        },
      ],
    });
  });

  test('handles claim with no accident or employment info', () => {
    const result = getClaimInfo(claim);

    expect(result).toEqual({
      relatedToemployment: false,
      relatedToAutoAccident: false,
      accidentLocation: '',
      accidentLocationState: '',
      relatedToOtherAccident: false,
      dateOfCurrentIllness: '',
      employmentImpactedEnd: '',
      employmentImpactedStart: '',
      hospitalizationEnd: '',
      hospitalizationStart: '',
      priorAuthRefNumber: '',
      outsideLab: false,
      outsideLabCharges: '',
      resubmissionCode: '',
      originalReference: '',
      patientAccountNumber: '',
      patientPaid: '',
      totalCharge: '',
      items: [],
    });
  });

  test('identifies other accident when accident exists but is not MVA', () => {
    const result = getClaimInfo({
      ...claim,
      accident: {
        date: '2024-03-30',
        type: {
          coding: [
            {
              code: 'WORK',
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              display: 'Work accident',
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      relatedToemployment: false,
      relatedToAutoAccident: false,
      accidentLocation: '',
      accidentLocationState: '',
      relatedToOtherAccident: true,
      dateOfCurrentIllness: '',
      employmentImpactedEnd: '',
      employmentImpactedStart: '',
      hospitalizationEnd: '',
      hospitalizationStart: '',
      priorAuthRefNumber: '',
      outsideLab: false,
      outsideLabCharges: '',
      resubmissionCode: '',
      originalReference: '',
      patientAccountNumber: '',
      patientPaid: '',
      totalCharge: '',
      items: [],
    });
  });

  test('identifies employment-related claim', () => {
    const result = getClaimInfo({
      ...claim,
      supportingInfo: [
        {
          category: {
            coding: [
              {
                code: 'employmentimpacted',
                system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory',
              },
            ],
          },
          sequence: 1,
        },
      ],
    });

    expect(result).toEqual({
      relatedToemployment: true,
      relatedToAutoAccident: false,
      accidentLocation: '',
      accidentLocationState: '',
      relatedToOtherAccident: false,
      dateOfCurrentIllness: '',
      employmentImpactedEnd: '',
      employmentImpactedStart: '',
      hospitalizationEnd: '',
      hospitalizationStart: '',
      priorAuthRefNumber: '',
      outsideLab: false,
      outsideLabCharges: '',
      resubmissionCode: '',
      originalReference: '',
      patientAccountNumber: '',
      patientPaid: '',
      totalCharge: '',
      items: [],
    });
  });

  test('handles partial accident location information', () => {
    const result = getClaimInfo({
      ...claim,
      accident: {
        date: '2024-03-30',
        locationAddress: {
          city: 'Wichita',
          state: 'KS',
        },
        type: {
          coding: [
            {
              code: 'MVA',
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      relatedToemployment: false,
      relatedToAutoAccident: true,
      accidentLocation: 'Wichita, KS',
      accidentLocationState: 'KS',
      relatedToOtherAccident: false,
      dateOfCurrentIllness: '',
      employmentImpactedEnd: '',
      employmentImpactedStart: '',
      hospitalizationEnd: '',
      hospitalizationStart: '',
      priorAuthRefNumber: '',
      outsideLab: false,
      outsideLabCharges: '',
      resubmissionCode: '',
      originalReference: '',
      patientAccountNumber: '',
      patientPaid: '',
      totalCharge: '',
      items: [],
    });
  });
});

describe('getClaimItemInfo', () => {
  test('returns complete claim item info when all fields are present', () => {
    const item: ClaimItem = {
      sequence: 1,
      servicedDate: '2024-04-14',
      locationAddress: {
        line: ['289 Johnson Street'],
        city: 'Ames',
        state: 'IA',
      },
      category: {
        coding: [
          {
            code: 'EMG',
          },
        ],
      },
      productOrService: {
        text: 'Exam, recall',
      },
      modifier: [
        {
          text: 'None',
        },
      ],
      diagnosisSequence: [1],
      net: {
        value: 1000,
        currency: 'USD',
      },
      quantity: {
        value: 20,
        unit: 'days',
      },
      programCode: [
        {
          coding: [
            {
              code: 'none',
            },
          ],
        },
      ],
    };

    const result = getClaimItemInfo(item);

    expect(result).toEqual({
      dateOfService: '4/14/2024',
      placeOfService: '289 Johnson Street, Ames, IA',
      placeOfServiceState: 'IA',
      emergency: true,
      procedureCode: 'Exam, recall',
      modifiers: 'None',
      diagnosisPointer: '1',
      charges: '$1,000.00',
      daysOrUnits: '20 days',
      familyPlanIndicator: '',
    });
  });

  test('handles missing optional fields', () => {
    const item: ClaimItem = {
      sequence: 1,
      servicedDate: '2024-04-14',
      productOrService: {
        text: 'Basic exam',
      },
    };

    const result = getClaimItemInfo(item);

    expect(result).toEqual({
      dateOfService: '4/14/2024',
      placeOfService: '',
      placeOfServiceState: '',
      emergency: false,
      procedureCode: 'Basic exam',
      modifiers: '',
      diagnosisPointer: '',
      charges: '',
      daysOrUnits: '',
      familyPlanIndicator: '',
    });
  });

  test('handles family planning indicator', () => {
    const item: ClaimItem = {
      sequence: 1,
      servicedDate: '2024-04-14',
      productOrService: {
        text: 'Family planning',
      },
      programCode: [
        {
          coding: [
            {
              code: 'fp',
            },
          ],
          text: 'Family Planning',
        },
      ],
    };

    const result = getClaimItemInfo(item);

    expect(result).toEqual({
      dateOfService: '4/14/2024',
      placeOfService: '',
      placeOfServiceState: '',
      emergency: false,
      procedureCode: 'Family planning',
      modifiers: '',
      diagnosisPointer: '',
      charges: '',
      daysOrUnits: '',
      familyPlanIndicator: 'Family Planning',
    });
  });
});

describe('getInsurerInfo', () => {
  test('returns complete Organization info when all fields are present', () => {
    const organization = fullAnswer.entry?.[4]?.resource as Organization;

    const result = getInsurerInfo(organization);

    expect(result).toEqual({
      fedTaxNumber: '5551844680',
      fedTaxType: 'http://example-systemt.org/tax',
      serviceLocation: '1901 Market Street, Philadelphia, PA, 19103',
      serviceNPI: '7911621876',
      serviceName: 'Independence Blue Cross Blue Shield',
    });
  });

  test('handles Organization with missing optional fields', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      name: 'Test Insurance Co',
    };

    const result = getInsurerInfo(organization);

    expect(result).toEqual({
      serviceNPI: '',
      serviceName: 'Test Insurance Co',
      serviceLocation: '',
      fedTaxNumber: '',
      fedTaxType: '',
    });
  });

  test('handles Organization with multiple identifiers but no matching types', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      name: 'Test Insurance Co',
      identifier: [
        {
          type: {
            coding: [
              {
                code: 'OTHER',
              },
            ],
          },
          value: 'OTHER-ID',
        },
      ],
    };

    const result = getInsurerInfo(organization);

    expect(result).toEqual({
      serviceNPI: '',
      serviceName: 'Test Insurance Co',
      serviceLocation: '',
      fedTaxNumber: '',
      fedTaxType: '',
    });
  });

  test('returns empty fields for Patient resource', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      name: [
        {
          given: ['John'],
          family: 'Doe',
        },
      ],
    };

    const result = getInsurerInfo(patient);

    expect(result).toEqual({
      serviceNPI: '',
      serviceName: '',
      serviceLocation: '',
      fedTaxNumber: '',
      fedTaxType: '',
    });
  });

  test('returns empty fields for RelatedPerson resource', () => {
    const relatedPerson: RelatedPerson = {
      resourceType: 'RelatedPerson',
      name: [
        {
          given: ['Jane'],
          family: 'Doe',
        },
      ],
      patient: { reference: 'Patient/123' },
    };

    const result = getInsurerInfo(relatedPerson);

    expect(result).toEqual({
      serviceNPI: '',
      serviceName: '',
      serviceLocation: '',
      fedTaxNumber: '',
      fedTaxType: '',
    });
  });
});

describe('getProviderInfo', () => {
  test('returns complete practitioner info', () => {
    const practitioner = fullAnswer.entry?.[3]?.resource as Practitioner;

    const result = getProviderInfo(practitioner);

    expect(result).toEqual({
      billingLocation: '2904 Main Street, Elizabeth, MD, 21219',
      billingName: 'Smith, Kevin',
      billingPhoneNumber: '555-555-9391',
      providerNpi: '2490433892',
    });
  });

  test('returns complete organization info', () => {
    const organization = fullAnswer.entry?.[4]?.resource as Organization;

    const result = getProviderInfo(organization);

    expect(result).toEqual({
      billingLocation: '1901 Market Street, Philadelphia, PA, 19103',
      billingName: 'Independence Blue Cross Blue Shield',
      billingPhoneNumber: '555-555-4321',
      providerNpi: '7911621876',
    });
  });

  test('returns empty fields for PractitionerRole', () => {
    const practitionerRole: PractitionerRole = {
      resourceType: 'PractitionerRole',
      practitioner: {
        reference: 'Practitioner/123',
      },
      organization: {
        reference: 'Organization/456',
      },
    };

    const result = getProviderInfo(practitionerRole);

    expect(result).toEqual({
      billingName: '',
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
    });
  });

  test('handles practitioner with missing optional fields', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      name: [
        {
          family: 'Smith',
        },
      ],
    };

    const result = getProviderInfo(practitioner);

    expect(result).toEqual({
      billingName: 'Smith',
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
    });
  });

  test('handles organization with missing optional fields', () => {
    const organization: Organization = {
      resourceType: 'Organization',
      name: 'Medical Group',
    };

    const result = getProviderInfo(organization);

    expect(result).toEqual({
      billingName: 'Medical Group',
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
    });
  });

  test('handles multiple phone numbers and selects the correct one', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      name: [
        {
          family: 'Smith',
        },
      ],
      telecom: [
        {
          system: 'email',
          value: 'smith@example.com',
        },
        {
          system: 'phone',
          value: '555-123-4567',
        },
        {
          system: 'fax',
          value: '555-999-8888',
        },
      ],
    };

    const result = getProviderInfo(practitioner);

    expect(result.billingPhoneNumber).toBe('555-123-4567');
  });

  test('handles empty arrays', () => {
    const practitioner: Practitioner = {
      resourceType: 'Practitioner',
      name: [],
      address: [],
      telecom: [],
      identifier: [],
    };

    const result = getProviderInfo(practitioner);

    expect(result).toEqual({
      billingName: '',
      billingLocation: '',
      billingPhoneNumber: '',
      providerNpi: '',
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

describe('getDateContent', () => {
  const expectedFontSize = 9;

  test('handles date with custom offsets', () => {
    const dob = new Date('1956-05-12');
    const xOffset = 395;
    const yOffset = 253;

    const result = getDateContent(dob, xOffset, yOffset);

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

    const result = getDateContent(dob);

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
    const result = getDateContent(undefined);
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

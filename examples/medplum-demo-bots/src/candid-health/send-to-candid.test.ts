import {
  CPT,
  createReference,
  getReferenceString,
  ICD10,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  MedplumClient,
  SNOMED,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Coverage, Encounter, Patient, SearchParameter } from '@medplum/fhirtypes';
import { DrAliceSmith, MockClient } from '@medplum/mock';
import fetch from 'node-fetch';
import { handler } from './send-to-candid';

vi.mock('node-fetch', () => ({
  default: vi.fn(() => ({
    json: () => ({}),
  })),
}));

describe('Candid Health Tests', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx) => {
    const medplum = new MockClient();

    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Kirby901',
          given: ['John43'],
          prefix: ['Mr.'],
        },
      ],

      gender: 'male',
      birthDate: '1940-09-05',
      address: [
        {
          line: ['599 Schowalter Promenade'],
          city: 'West Springfield',
          state: 'MA',
          postalCode: '01089',
          country: 'US',
          period: {
            start: '1940-09-05',
          },
        },
      ],
      maritalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
            code: 'M',
            display: 'M',
          },
        ],
        text: 'M',
      },
    });

    const serviceProvider = await medplum.createResource({
      resourceType: 'Organization',
      name: 'HOLYOKE MEDICAL CENTER',
      address: [
        {
          line: ['575 BEECH STREET'],
          city: 'HOLYOKE',
          state: 'MA',
          postalCode: '01040-2223',
          country: 'US',
        },
      ],
    });

    const encounter = await medplum.createResource({
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
      },
      type: [
        {
          coding: [
            {
              system: SNOMED,
              code: '394701000',
              display: 'Asthma follow-up',
            },
            {
              system: CPT,
              code: '99213',
              display: 'Established patient office visit, 20-29 minutes',
            },
          ],
          text: 'Asthma follow-up',
        },
      ],
      subject: createReference(patient),
      participant: [
        {
          type: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  code: 'PPRF',
                  display: 'primary performer',
                },
              ],
              text: 'primary performer',
            },
          ],
          period: {
            start: '2022-02-11T23:33:18.000Z',
          },
          individual: createReference(DrAliceSmith),
        },
      ],
      period: {
        start: '2022-02-11T23:33:18.000Z',
      },
      reasonCode: [
        {
          coding: [
            {
              system: SNOMED,
              code: '195967001',
              display: 'Asthma',
            },
            {
              system: ICD10,
              code: 'J45.5',
              display: 'Severe persistent asthma',
            },
          ],
        },
      ],
      serviceProvider: createReference(serviceProvider),
      resourceType: 'Encounter',
    } as Encounter);

    const coverage: Coverage = await medplum.createResource(
      // start-block exampleCoverage
      {
        resourceType: 'Coverage',

        // Member id
        identifier: [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                  code: 'MB',
                  display: 'Member Number',
                },
              ],
            },
            system: 'https://www.acmeinsurance.com/glossary/memberid',
            value: '102345672-01',
            assigner: {
              display: 'Acme Insurance Co',
            },
          },
        ],
        subscriberId: '102345672-01',
        status: 'active',

        // Plan type
        type: {
          coding: [
            {
              system: 'https://nahdo.org/sopt',
              code: '512',
              display: 'Commercial Managed Care - PPO',
            },
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'PPO',
              display: 'preferred provider organization policy',
            },
          ],
          text: 'health insurance plan policy',
        },

        // Subscriber & Beneficiary
        subscriber: createReference(patient),
        beneficiary: createReference(patient),
        relationship: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
              code: 'self',
              display: 'Self',
            },
          ],
        },
        period: {
          start: '2021-01-01',
        },

        // Payor
        payor: [
          {
            display: 'Acme Insurance Co',
          },
        ],
        // Classification Codes
        class: [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'group',
                },
              ],
            },
            value: '993355',
            name: 'Stars Inc',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'plan',
                },
              ],
            },
            value: '11461128',
            name: 'Acme Gold Plus',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCoverageClassCS',
                  code: 'division',
                },
              ],
            },
            value: '11',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCoverageClassCS',
                  code: 'network',
                },
              ],
            },
            value: '561490',
            name: 'Acme Gold Plus South',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'rxbin',
                },
              ],
            },
            value: '100045',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'rxpcn',
                },
              ],
            },
            value: '1234000',
          },
        ],

        // Cost Sharing Provisions
        costToBeneficiary: [
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamOutDed',
                  display: 'Family Out of Network Deductible',
                },
              ],
            },
            valueMoney: {
              value: 10000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamInDed',
                  display: 'Family In Network Deductible',
                },
              ],
            },
            valueMoney: {
              value: 8000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamRxOutDed',
                  display: 'Family Pharmacy Out of Network Deductible',
                },
              ],
            },
            valueMoney: {
              value: 2000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamRxInDed',
                  display: 'Family Pharmacy In Network Deductible',
                },
              ],
            },
            valueMoney: {
              value: 1500,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamOutMax',
                  display: 'Family Out of Network Out of Pocket Maximum',
                },
              ],
            },
            valueMoney: {
              value: 12000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamInMax',
                  display: 'Family In Network Out of Pocket Maximum',
                },
              ],
            },
            valueMoney: {
              value: 10000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamRxOutMax',
                  display: 'Family Pharmacy Out of Network Out of Pocket Maximum',
                },
              ],
            },
            valueMoney: {
              value: 3000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'FamRxInMax',
                  display: 'Family Pharmacy In Network Out of Pocket Maximum',
                },
              ],
            },
            valueMoney: {
              value: 2000,
              currency: 'USD',
            },
          },
          {
            type: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/us/insurance-card/CodeSystem/C4DICExtendedCopayTypeCS',
                  code: 'rx',
                },
              ],
            },
            valueMoney: {
              extension: [
                {
                  url: 'http://hl7.org/fhir/us/insurance-card/StructureDefinition/C4DIC-BeneficiaryCostString-extension',
                  valueString: 'DED THEN $10/$40/$70/25%',
                },
              ],
            },
          },
        ],
      }
      // end-block exampleCoverage
    );

    Object.assign(ctx, { medplum, patient, encounter, coverage });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  test('Send to Candid', async (ctx: any) => {
    const { medplum, patient, encounter } = ctx as { medplum: MedplumClient; patient: Patient; encounter: Encounter };
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {
        CANDID_API_KEY: { name: 'CANDID_API_KEY', valueString: '123' },
        CANDID_API_SECRET: { name: 'CANDID_API_SECRET', valueString: 'ABC' },
      },
    });

    const body = JSON.parse(vi.mocked(fetch).mock?.lastCall?.[1]?.body?.toString() || '{}');

    expect(body).toMatchObject({
      external_id: getReferenceString(encounter),
      date_of_service: '2022-02-11',
      patient_authorized_release: true,
      benefits_assigned_to_provider: true,
      provider_accepts_assignment: true,
      appointment_type: 'Asthma follow-up',
      do_not_bill: false,
      billing_provider: { first_name: 'Alice', last_name: 'Smith' },
      rendering_provider: { first_name: 'Alice', last_name: 'Smith' },
      service_facility: {
        organization_name: 'HOLYOKE MEDICAL CENTER',
        address: {
          address1: '575 BEECH STREET',
          address2: '',
          city: 'HOLYOKE',
          state: 'MA',
          zip_code: '01040',
          zip_plus_four_code: '2223',
        },
      },
      pay_to_address: {
        address1: '575 BEECH STREET',
        address2: '',
        city: 'HOLYOKE',
        state: 'MA',
        zip_code: '01040',
        zip_plus_four_code: '2223',
      },
      patient: {
        first_name: 'John43',
        last_name: 'Kirby901',
        gender: 'male',
        external_id: getReferenceString(patient),
        date_of_birth: '1940-09-05',
        address: {
          address1: '599 Schowalter Promenade',
          address2: '',
          city: 'West Springfield',
          state: 'MA',
          zip_code: '01089',
        },
      },
      subscriber_primary: {
        first_name: 'John43',
        last_name: 'Kirby901',
        gender: 'male',
        date_of_birth: '1940-09-05',
        address: {
          address1: '599 Schowalter Promenade',
          address2: '',
          city: 'West Springfield',
          state: 'MA',
          zip_code: '01089',
        },
        patient_relationship_to_subscriber_code: '18',
        insurance_card: {
          group_number: '993355',
          plan_name: 'Stars Inc',
          plan_type: '12',
          insurance_type: 'string',
          member_id: '102345672-01',
          payer_name: 'string',
          payer_id: '00019',
          rx_bin: '100045',
          rx_pcn: '1234000',
          image_url_front: 'string',
          image_url_back: 'string',
        },
      },
      diagnoses: [{ code_type: 'ABK', code: 'J45.5', name: 'Severe persistent asthma' }],
      place_of_service_code: '10',
      service_lines: [
        { procedure_code: '99213', quantity: '1', units: 'MJ', charge_amount_cents: 10000, diagnosis_pointers: [0] },
      ],
      synchronicity: 'Synchronous',
    });
  });
});

import { Bundle } from '@medplum/fhirtypes';

export const fullAnswer: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945',
      request: { method: 'POST', url: 'Patient' },
      resource: {
        resourceType: 'Patient',
        name: [
          {
            given: ['Homer'],
            family: 'Simpson',
          },
        ],
        birthDate: '1956-05-12',
        gender: 'male',
        address: [
          {
            line: ['742 Evergreen Terrace'],
            city: 'Springfield',
            state: 'IL',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:7914fb49-05e1-45cc-bffc-a3fdff1b72e1',
      request: { method: 'POST', url: 'RelatedPerson' },
      resource: {
        resourceType: 'RelatedPerson',
        patient: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945' },
        name: [{ given: ['Marge'], family: 'Simpson' }],
        address: [
          {
            line: ['742 Evergreen Terrace'],
            city: 'Springfield',
            state: 'IL',
          },
        ],
        birthDate: '1960-08-12',
        gender: 'female',
      },
    },
    {
      fullUrl: 'urn:uuid:f1ed24bf-7efa-44a1-b5ea-cc46414a282d',
      request: { method: 'POST', url: 'Organization' },
      resource: {
        resourceType: 'Organization',
        identifier: [
          {
            use: 'official',
            type: {
              coding: [
                {
                  system: 'http://example.org/org-id',
                  code: 'NPI',
                },
              ],
            },
            value: 'example-npi-number',
          },
          {
            use: 'official',
            type: {
              coding: [
                {
                  system: 'http://example.org/org-id',
                  code: 'TAX',
                },
              ],
            },
            value: 'example-tax-id',
            system: 'http://example-systemt.org/tax',
          },
        ],
        name: 'Independence Blue Cross Blue Shield',
        address: [
          {
            line: ['1901 Market Street'],
            city: 'Philadelphia',
            state: 'PA',
            postalCode: '19103',
            type: 'both',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:72ec6c80-6dab-41e0-adff-a8670a5b4363',
      request: { method: 'POST', url: 'Coverage' },
      resource: {
        resourceType: 'Coverage',
        identifier: [
          {
            use: 'official',
            value: '89442808',
          },
        ],
        status: 'active',
        beneficiary: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945', display: 'Homer Simpson' },
        payor: [
          {
            reference: 'urn:uuid:f1ed24bf-7efa-44a1-b5ea-cc46414a282d',
            display: 'Independence Blue Cross Blue Shield',
          },
        ],
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'HIP',
              display: 'health insurance plan policy',
            },
          ],
        },
        relationship: {
          coding: [
            {
              system: 'http://hl7.org/fhir/ValueSet/subscriber-relationship',
              code: 'spouse',
              display: 'Spouse',
            },
          ],
        },
        subscriber: {
          reference: 'urn:uuid:7914fb49-05e1-45cc-bffc-a3fdff1b72e1',
        },
      },
    },
    {
      fullUrl: 'urn:uuid:706245c5-5f9d-45eb-bf90-cee2fac3f52c',
      request: { method: 'POST', url: 'Practitioner' },
      resource: {
        resourceType: 'Practitioner',
        identifier: [
          {
            system: 'http://example.org/practitioner-npi',
            id: 'NPI',
            value: '2490433892',
          },
        ],
        name: [
          {
            given: ['Kevin'],
            family: 'Smith',
          },
        ],
        address: [
          {
            line: ['2904 Main Street'],
            city: 'Elizabeth',
            state: 'MD',
            country: 'US  ',
          },
        ],
        telecom: [
          {
            use: 'work',
            system: 'phone',
            value: '3915559391',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:6a86eda3-ce9e-472c-ba6b-1855e518d779',
      request: { method: 'POST', url: 'Claim' },
      resource: {
        resourceType: 'Claim',
        identifier: [
          {
            system: 'http://example.org/claims',
            value: 'example-claim',
          },
        ],
        status: 'active',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/claim-type',
              code: 'professional',
              display: 'Professional',
            },
          ],
        },
        use: 'claim',
        patient: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945', display: 'Homer Simpson' },
        created: '2020-04-17T11:15:12.614Z',
        priority: {
          coding: [
            {
              system: 'http://hl7.org/fhir/ValueSet/process-priority',
              code: 'normal',
            },
          ],
        },
        insurance: [
          {
            coverage: {
              reference: 'urn:uuid:72ec6c80-6dab-41e0-adff-a8670a5b4363',
              display: 'Homer Simpson Health Insurance Plan',
            },
            sequence: 1,
            focal: true,
            preAuthRef: ['0923092390'],
          },
        ],
        provider: { reference: 'urn:uuid:706245c5-5f9d-45eb-bf90-cee2fac3f52c' },
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
            timingPeriod: {
              start: '2024-04-02',
              end: '2024-04-20',
            },
          },
          {
            category: {
              coding: [{ code: 'info', system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory' }],
            },
            sequence: 2,
            code: {
              coding: [{ system: 'http://example.org/info-codes', code: 'patientaccount' }],
            },
            valueString: '429802409',
          },
          {
            category: {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'onset' }],
            },
            sequence: 3,
            timingDate: '2024-02-02',
          },
          {
            category: {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'hospitalized' },
              ],
            },
            sequence: 4,
            timingPeriod: {
              start: '2024-03-30',
              end: '2024-05-21',
            },
          },
          {
            category: {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'patientpaid' },
              ],
            },
            sequence: 5,
            valueQuantity: {
              value: 100,
              unit: 'USD',
            },
          },
        ],
        total: {
          currency: 'USD',
          value: 1000,
        },
        diagnosis: [
          {
            sequence: 1,
            diagnosisCodeableConcept: {
              coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J20', display: 'Acute bronchitis' }],
            },
          },
        ],
        related: [
          {
            relationship: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/ex-relatedclaimrelationship',
                  code: 'prior',
                  display: 'Prior Claim',
                },
              ],
            },
          },
        ],
        accident: {
          date: '2024-03-30',
          locationAddress: {
            line: ['39 Green Lane'],
            city: 'Wichita',
            state: 'KS',
            country: 'US',
          },
          type: {
            coding: [
              {
                code: 'MVA',
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                display: 'Motor vehicle accident',
              },
            ],
          },
        },
        item: [
          {
            servicedDate: '2024-04-14',
            sequence: 1,
            productOrService: {
              coding: [{ system: 'http://hl7.org/fhir/ValueSet/service-uscls', code: '1201', display: 'Exam, recall' }],
            },
            locationAddress: {
              line: ['289 Johnson Street'],
              city: 'Ames',
              state: 'IA',
            },
            category: {
              coding: [{ system: 'http://example.org/claim-item-category', code: 'EMG', display: 'Emergency' }],
            },
            modifier: [
              { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/modifiers', code: 'x', display: 'None' }] },
            ],
            diagnosisSequence: [1],
            net: {
              currency: 'USD',
              value: 1000,
            },
            quantity: {
              unit: 'days',
              value: 20,
            },
            programCode: [
              {
                coding: [
                  { code: 'none', system: 'http://terminology.hl7.org/CodeSystem/ex-programcode', display: 'None' },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

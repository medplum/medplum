import { Bundle } from '@medplum/fhirtypes';

export const fullAnswer: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    {
      fullUrl: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945',
      request: { method: 'PUT', url: 'Patient?name=Homer%20Simpson' },
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
            postalCode: '62704',
          },
        ],
        telecom: [
          {
            system: 'phone',
            use: 'mobile',
            value: '555-555-6392',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:7914fb49-05e1-45cc-bffc-a3fdff1b72e1',
      request: { method: 'PUT', url: 'RelatedPerson?name=Marge%20Simpson' },
      resource: {
        resourceType: 'RelatedPerson',
        patient: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945' },
        name: [{ given: ['Marge'], family: 'Simpson' }],
        birthDate: '1960-08-12',
        gender: 'female',
        address: [
          {
            line: ['742 Evergreen Terrace'],
            city: 'Springfield',
            state: 'IL',
            postalCode: '62704',
          },
        ],
        telecom: [
          {
            system: 'phone',
            use: 'mobile',
            value: '555-555-6393',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:e2523da4-9d6e-442c-99aa-fcfe3353c9e3',
      request: { method: 'PUT', url: 'RelatedPerson?name=Abraham%20Simpson' },
      resource: {
        resourceType: 'RelatedPerson',
        patient: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945' },
        name: [{ given: ['Abraham'], family: 'Simpson' }],
        birthDate: '1927-06-04',
        gender: 'male',
        address: [
          {
            line: ['Springfield Retirement Castle'],
            city: 'Springfield',
            state: 'IL',
            postalCode: '62704',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:706245c5-5f9d-45eb-bf90-cee2fac3f52c',
      request: { method: 'PUT', url: 'Practitioner?identifier=2490433892' },
      resource: {
        resourceType: 'Practitioner',
        identifier: [
          {
            system: 'http://hl7.org/fhir/sid/us-npi',
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
            country: 'US',
            postalCode: '21219',
          },
        ],
        telecom: [
          {
            use: 'work',
            system: 'phone',
            value: '555-555-9391',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:f1ed24bf-7efa-44a1-b5ea-cc46414a282d',
      request: { method: 'PUT', url: 'Organization?identifier=7911621876' },
      resource: {
        resourceType: 'Organization',
        identifier: [
          {
            use: 'official',
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '7911621876',
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
            value: '5551844680',
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
        telecom: [
          {
            system: 'phone',
            use: 'work',
            value: '555-555-4321',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:4bc72375-425d-4fb0-be6e-38bc6144d1e5',
      request: { method: 'PUT', url: 'Organization?identifier=5746217289' },
      resource: {
        resourceType: 'Organization',
        identifier: [
          {
            use: 'official',
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '5746217289',
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
            value: '5554404734',
            system: 'http://example-systemt.org/tax',
          },
        ],
        name: 'Medicare Insurance',
        address: [
          {
            line: ['2578 Elmwood Avenue'],
            city: 'Chicago',
            state: 'IL',
            postalCode: '60610',
            type: 'both',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:72ec6c80-6dab-41e0-adff-a8670a5b4363',
      request: { method: 'PUT', url: 'Coverage?identifier=89442808' },
      resource: {
        resourceType: 'Coverage',
        identifier: [
          {
            use: 'official',
            value: '89442808',
          },
        ],
        status: 'active',
        beneficiary: {
          reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945',
          display: 'Homer Simpson',
        },
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
          display: 'Marge Simpson',
        },
        class: [
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'plan',
                },
              ],
            },
            value: 'B37FC',
            name: 'Independence Blue Full Coverage',
          },
          {
            type: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                  code: 'group',
                },
              ],
            },
            value: '123456789',
            name: 'Independence Blue Group Plan',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:10e49ae1-acf1-4288-93d3-5bbb504957aa',
      request: { method: 'PUT', url: 'Coverage?identifier=21173018' },
      resource: {
        resourceType: 'Coverage',
        identifier: [
          {
            use: 'official',
            value: '21173018',
          },
        ],
        status: 'active',
        beneficiary: {
          reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945',
          display: 'Homer Simpson',
        },
        payor: [
          {
            reference: 'urn:uuid:4bc72375-425d-4fb0-be6e-38bc6144d1e5',
            display: 'Medicare Insurance',
          },
        ],
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'EHCPOL',
              display: 'extended healthcare',
            },
          ],
        },
        relationship: {
          coding: [
            {
              system: 'http://hl7.org/fhir/ValueSet/subscriber-relationship',
              code: 'child',
              display: 'Child',
            },
          ],
        },
        subscriber: {
          reference: 'urn:uuid:e2523da4-9d6e-442c-99aa-fcfe3353c9e3',
          display: 'Abraham Simpson',
        },
        class: [
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
            name: 'Medicare Gold Plus',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:30192746-113d-4c78-af02-3090ce22996f',
      request: { method: 'PUT', url: 'ServiceRequest?identifier=4839201756' },
      resource: {
        resourceType: 'ServiceRequest',
        identifier: [
          {
            system: 'http://hl7.org/fhir/sid/us-npi',
            value: '4839201756',
          },
        ],
        status: 'active',
        intent: 'order',
        category: [
          {
            coding: [
              { system: 'http://snomed.info/sct', code: '103696004', display: 'Patient referral to specialist' },
            ],
          },
        ],
        subject: { reference: 'urn:uuid:8796eac7-4ee2-4b9a-84f7-68691173e945', display: 'Homer Simpson' },
        requester: { reference: 'urn:uuid:706245c5-5f9d-45eb-bf90-cee2fac3f52c', display: 'Kevin Smith' },
      },
    },
    {
      fullUrl: 'urn:uuid:6a86eda3-ce9e-472c-ba6b-1855e518d779',
      request: { method: 'PUT', url: 'Claim?identifier=example-claim-cms1500' },
      resource: {
        resourceType: 'Claim',
        identifier: [
          {
            system: 'http://example.org/claims',
            value: 'example-claim-cms1500',
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
        referral: { reference: 'urn:uuid:30192746-113d-4c78-af02-3090ce22996f' },
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
          {
            coverage: {
              reference: 'urn:uuid:10e49ae1-acf1-4288-93d3-5bbb504957aa',
              display: 'Abraham Simpson Extended Healthcare Plan',
            },
            sequence: 2,
            focal: false,
          },
        ],
        provider: { reference: 'urn:uuid:706245c5-5f9d-45eb-bf90-cee2fac3f52c', display: 'Kevin Smith' },
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
              coding: [{ code: 'info', system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory' }],
            },
            code: {
              coding: [{ system: 'http://example.org/info-codes', code: 'patientpaid' }],
            },
            sequence: 5,
            valueQuantity: {
              value: 320,
              unit: 'USD',
            },
          },
          {
            category: {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'outsidelab' },
              ],
            },
            sequence: 6,
            valueQuantity: {
              value: 125,
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
          {
            sequence: 2,
            diagnosisCodeableConcept: {
              coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'G89.4', display: 'Chronic pain syndrome' }],
            },
          },
          {
            sequence: 3,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ3' }] },
          },
          {
            sequence: 4,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ4' }] },
          },
          {
            sequence: 5,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ5' }] },
          },
          {
            sequence: 6,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ6' }] },
          },
          {
            sequence: 7,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ7' }] },
          },
          {
            sequence: 8,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ8' }] },
          },
          {
            sequence: 9,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ9' }] },
          },
          {
            sequence: 10,
            diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'XYZ10' }] },
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
            diagnosisSequence: [1, 2],
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
          {
            servicedDate: '2024-05-15',
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
            diagnosisSequence: [1, 2],
            net: {
              currency: 'USD',
              value: 2000,
            },
            quantity: {
              unit: 'days',
              value: 10,
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

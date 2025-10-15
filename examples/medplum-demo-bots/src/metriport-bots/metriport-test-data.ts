// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Organization, Patient } from '@medplum/fhirtypes';
import type { PatientDTO } from '@metriport/api-sdk';

/* Medplum resources */

export const CareFacilityMedplumOrganization: Organization = {
  resourceType: 'Organization',
  identifier: [
    { system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567891' },
    { system: 'https://metriport.com/fhir/identifiers/organization-id', value: '0195d964-d166-7226-8912-76934c23c140' },
  ],
  name: 'Care Facility, LLC',
};

export const JaneSmithMedplumPatient: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['Jane'], family: 'Smith' }],
  birthDate: '1996-02-10',
  gender: 'female',
  address: [
    {
      line: ['123 Arsenal St'],
      city: 'Phoenix',
      state: 'AZ',
      postalCode: '85300',
    },
  ],
  telecom: [
    { system: 'phone', value: '555-555-5555' },
    { system: 'email', value: 'jane.smith@example.com' },
  ],
};

/* Metriport resources */

export const JaneSmithMetriportPatient: PatientDTO = {
  id: '0195d965-bfbc-7825-8a8a-b48baf403559',
  facilityIds: ['0195d964-d166-7226-8912-76934c23c140'],
  externalId: '',
  dateCreated: new Date('2025-03-27T20:57:58.974Z'),
  firstName: 'Jane',
  lastName: 'Smith',
  dob: '1996-02-10',
  genderAtBirth: 'F',
  personalIdentifiers: [],
  address: [
    {
      zip: '85300',
      city: 'Phoenix',
      state: 'AZ',
      country: 'USA',
      addressLine1: '123 Arsenal St',
    },
  ],
  contact: [],
};

export const MetriportConsolidatedDataBundle: Bundle = {
  resourceType: 'Bundle',
  total: 8,
  type: 'searchset',
  entry: [
    {
      fullUrl: 'urn:uuid:0195d965-bfbc-7825-8a8a-b48baf403559',
      resource: {
        resourceType: 'Patient',
        id: '0195d965-bfbc-7825-8a8a-b48baf403559',
        text: {
          status: 'generated',
          div: '<div xmlns="http://www.w3.org/1999/xhtml">Jane Smith</div>',
        },
        name: [{ family: 'Smith', given: ['Jane'] }],
        gender: 'female',
        birthDate: '1996-02-10',
        address: [{ line: ['123 Arsenal St'], city: 'Phoenix', state: 'AZ', postalCode: '85300', country: 'USA' }],
      },
    },
    {
      fullUrl: 'urn:uuid:73fbeae4-f7e6-425b-b9c7-2ff7c258e24d',
      resource: {
        resourceType: 'Practitioner',
        id: '73fbeae4-f7e6-425b-b9c7-2ff7c258e24d',
        identifier: [
          {
            use: 'usual',
            system:
              'https://public.metriport.com/identifiers//CaregiverIdentifier//1.3.6.1.4.1.37608.1.3.6.1.4.1.37608/ISO',
            value: 'P/0KJ2NOQx0H1BySKKZKvw==',
          },
          {
            system: 'https://public.metriport.com/identifiers/Proprietary/1.3.6.1.4.1.37608_',
            value: '7v1bjE+iv1TpK7xwyhaXbw==',
          },
          {
            system: 'https://public.metriport.com/identifiers/Proprietary/1.3.6.1.4.1.37608',
            value: 'c68394cb-57ad-e411-8260-0050b664cec5',
          },
        ],
        name: [{ use: 'official', family: 'Smith', given: ['David', 'K'], suffix: ['MD'] }],
        qualification: [
          {
            code: {
              text: 'Internal Medicine',
              coding: [
                {
                  code: '207R00000X',
                  display: 'INTERNAL MEDICINE PHYSICIAN',
                  system: 'http://nucc.org/provider-taxonomy',
                },
              ],
            },
          },
        ],
        telecom: [{ system: 'phone', value: 'tel:212-555-7351', use: 'home' }],
        address: [{ line: ['543 Doctor Avenue'], city: 'New York', state: 'NY', postalCode: '10001', use: 'home' }],
      },
    },
    {
      fullUrl: 'urn:uuid:52c3523e-4912-4d48-97a8-7e531e0682cb',
      resource: {
        resourceType: 'DocumentReference',
        id: '52c3523e-4912-4d48-97a8-7e531e0682cb',
        identifier: [
          {
            use: 'usual',
            value: '1490066281_20231002103338_HXRuUxbOQlKwMya5aDUWdw==_1+Fsp7QaCzgtXoIkGo252w==',
          },
        ],
        status: 'current',
        type: {
          coding: [
            { system: 'urn:oid:2.16.840.1.113883.6.1', code: '11506-3', display: 'Progress note' },
            { system: 'http://loinc.org', code: '11506-3', display: 'Prog note', userSelected: false },
          ],
        },
        subject: { reference: 'Patient/0195d965-bfbc-7825-8a8a-b48baf403559' },
        date: '2023-10-02T10:33:38-04:00',
        author: [{ reference: 'Practitioner/73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' }],
        description: 'Progress Notes',
        content: [
          {
            attachment: {
              contentType: 'text/plain; charset=UTF-8',
              data: 'Tm90ZSBwZXJzaXN0ZW50IGh5cGVydGVuc2l2ZSB0cmVuZCBvdmVyIHRoZSBsYXN0IGZldyBkYXlzLiAgSGF2ZSBhZGRlZCBhbWxvZGlwaW5lIDUgbWcgb25jZSBkYWlseS4=',
            },
          },
        ],
        context: {
          encounter: [{ reference: 'Encounter/9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5' }],
          period: { start: '2023-10-02T10:33:38-04:00' },
        },
      },
    },
    {
      fullUrl: 'urn:uuid:40a528af-5c42-4c05-ae03-f2527137f994',
      resource: {
        resourceType: 'Location',
        id: '40a528af-5c42-4c05-ae03-f2527137f994',
        name: 'MARY FREE BED AT SPARROW',
        description: 'MARY FREE BED AT SPARROW',
        type: [
          {
            coding: [
              {
                system: 'https://public.metriport.com/codes/Proprietary/LocationType',
                code: 'SDLOC',
                display: 'Service Delivery Location',
                userSelected: true,
              },
            ],
          },
        ],
        address: {
          line: ['1215 E MICHIGAN AVE'],
          city: 'LANSING',
          district: 'INGHAM',
          state: 'MI',
          postalCode: '48912',
          country: 'USA',
        },
      },
    },
    {
      fullUrl: 'urn:uuid:9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5',
      resource: {
        resourceType: 'Encounter',
        id: '9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5',
        identifier: [
          { use: 'usual', system: 'https://public.metriport.com/encounteridentifiers', value: '1490066281' },
        ],
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'IMP',
          display: 'Inpatient Encounter',
        },
        type: [
          {
            coding: [
              {
                system: 'https://public.metriport.com/codes/Proprietary/PatientType',
                code: 'Hospital Encounter',
                display: 'Hospital Encounter',
                userSelected: true,
              },
              {
                system: 'https://www.cms.gov/Medicare/Coding/place-of-service-codes/Place_of_Service_Code_Set',
                code: '21',
                display: 'Inpatient Hospital',
                userSelected: false,
              },
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'IMP',
                display: 'IMP',
                userSelected: false,
              },
            ],
          },
        ],
        subject: { reference: 'Patient/0195d965-bfbc-7825-8a8a-b48baf403559' },
        participant: [
          {
            type: [
              {
                coding: [
                  {
                    system: 'https://public.metriport.com/fhircodes#CaregiverRelationshipType',
                    code: 'AttendingPhysician',
                    display: 'Attending Physician',
                    userSelected: true,
                  },
                ],
              },
            ],
            period: { start: '2023-09-20T16:51:00-04:00' },
            individual: { reference: 'Practitioner/73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' },
          },
        ],
        period: {
          start: '2023-09-20T16:51:00-04:00',
          end: '2023-10-03T11:00:00-04:00',
        },
        hospitalization: {
          dischargeDisposition: {
            coding: [
              {
                system: 'https://public.metriport.com/codes/Proprietary.2.16.840.1.113883.12.112/DischargeType',
                code: '1',
                display: 'Discharged to home care or self care (routine discharge)',
                userSelected: true,
              },
              {
                system: 'https://www.nubc.org/CodeSystem/PatDischargeStatus',
                code: '01',
                display: 'DISCHARGED TO HOME OR SELF CARE (ROUTINE DISCHARGE)',
                userSelected: false,
              },
            ],
          },
        },
        location: [
          {
            location: {
              reference: 'Location/40a528af-5c42-4c05-ae03-f2527137f994',
              display: 'MARY FREE BED AT SPARROW',
            },
            period: {
              start: '2023-09-20T16:51:00-04:00',
              end: '2023-10-03T11:00:00-04:00',
            },
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:51893137-becb-4f5b-963b-7741d1cb8de2',
      resource: {
        resourceType: 'AllergyIntolerance',
        id: '51893137-becb-4f5b-963b-7741d1cb8de2',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
              code: 'active',
            },
          ],
        },
        patient: { reference: 'Patient/0195d965-bfbc-7825-8a8a-b48baf403559' },
        onsetDateTime: '2021-06-28T00:00:00.000Z',
        recorder: { reference: 'Practitioner/73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' },
        reaction: [
          {
            substance: {
              text: 'Dust',
              coding: [
                {
                  system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                  code: '235618',
                },
              ],
            },
            manifestation: [
              {
                text: 'Hives',
                coding: [
                  {
                    system: 'http://snomed.info/sct',
                    code: '247472004',
                    display: 'Hives',
                  },
                ],
              },
            ],
            onset: '2021-06-28T00:00:00.000Z',
          },
        ],
      },
    },
    {
      fullUrl: 'urn:uuid:7e6747bd-fc1a-418a-a178-8518db7f95f5',
      resource: {
        resourceType: 'Medication',
        id: '7e6747bd-fc1a-418a-a178-8518db7f95f5',
        code: {
          text: 'oxyCODONE-acetaminophen (PERCOCET) 5-325 mg tablet',
          coding: [
            {
              code: '1049221',
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            },
            {
              code: '0406-0512-01',
              system: 'http://hl7.org/fhir/sid/ndc',
            },
          ],
        },
      },
    },
    {
      fullUrl: 'urn:uuid:46806a66-3b4c-43dd-ac0d-7d0b10042ee5',
      resource: {
        resourceType: 'MedicationRequest',
        id: '46806a66-3b4c-43dd-ac0d-7d0b10042ee5',
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '997488',
              display: 'oxyCODONE-acetaminophen (PERCOCET) 5-325 mg tablet',
            },
          ],
          text: 'oxyCODONE-acetaminophen (PERCOCET) 5-325 mg tablet',
        },
        subject: { reference: 'Patient/0195d965-bfbc-7825-8a8a-b48baf403559' },
        encounter: { reference: 'Encounter/9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5' },
        medicationReference: { reference: 'Medication/7e6747bd-fc1a-418a-a178-8518db7f95f5' },
        authoredOn: '2003-04-05T10:13:00-05:00',
        requester: { reference: 'Practitioner/73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' },
        dosageInstruction: [{ sequence: 1, asNeededBoolean: true }],
      },
    },
  ],
};

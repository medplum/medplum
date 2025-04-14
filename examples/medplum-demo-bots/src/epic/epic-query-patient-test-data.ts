import { Organization, Patient, Practitioner } from '@medplum/fhirtypes';

export const epicOrganization: Organization = {
  resourceType: 'Organization',
  id: 'enRyWnSP963FYDpoks4NHOA3',
  identifier: [
    {
      use: 'usual',
      type: {
        text: 'EPIC',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.61',
      value: '1627363736',
    },
    {
      use: 'usual',
      type: {
        text: 'NPI',
      },
      system: 'http://hl7.org/fhir/sid/us-npi',
      value: '1627363736',
    },
    {
      use: 'usual',
      type: {
        text: 'TAX',
      },
      system: 'urn:oid:2.16.840.1.113883.4.4',
      value: '112233445',
    },
    {
      use: 'usual',
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.696570',
      value: '10',
    },
  ],
  active: true,
  name: 'Epic Hospital System',
  address: [
    {
      line: ['123 Anywhere St.'],
      city: 'VERONA',
      state: 'Wisconsin',
      postalCode: '53593',
    },
  ],
};

export const epicPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'eM5CWtq15N0WJeuCet5bJlQ3',
  identifier: [
    {
      use: 'usual',
      type: {
        text: 'NPI',
      },
      system: 'http://hl7.org/fhir/sid/us-npi',
      value: '1627363736',
    },
    {
      use: 'usual',
      type: {
        text: 'INTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.697780',
      value: '  FAMMD',
    },
    {
      use: 'usual',
      type: {
        text: 'EXTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.697780',
      value: 'FAMMD',
    },
    {
      use: 'usual',
      type: {
        text: 'PROVID',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.6',
      value: '1000',
    },
    {
      use: 'usual',
      type: {
        text: 'EPIC',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.7',
      value: '207Q00000X',
    },
    {
      use: 'usual',
      type: {
        text: 'NPI',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.60',
      value: '1627363736',
    },
    {
      use: 'usual',
      type: {
        text: 'Epic',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.63',
      value: '6011',
    },
    {
      use: 'usual',
      type: {
        text: 'INTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.836982',
      value: '   E1000',
    },
    {
      use: 'usual',
      type: {
        text: 'EXTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.836982',
      value: 'E1000',
    },
  ],
  active: true,
  name: [
    {
      use: 'usual',
      text: 'Family Medicine Physician, MD',
      family: 'Family Medicine',
      given: ['Physician'],
    },
  ],
  gender: 'male',
  qualification: [
    {
      code: {
        coding: [
          {
            system: 'urn:oid:1.2.840.114350.1.13.0.1.7.4.836982.6000',
            code: '11',
            display: 'MD',
          },
        ],
        text: 'MD',
      },
    },
  ],
};

export const epicPatient: Patient = {
  resourceType: 'Patient',
  id: 'erXuFYUfucBZaryVksYEcMg3',
  extension: [
    {
      valueCodeableConcept: {
        coding: [
          {
            system: 'urn:oid:1.2.840.114350.1.13.0.1.7.10.698084.130.657370.19999000',
            code: 'female',
            display: 'female',
          },
        ],
      },
      url: 'http://open.epic.com/FHIR/StructureDefinition/extension/legal-sex',
    },
    {
      valueCodeableConcept: {
        coding: [
          {
            system: 'urn:oid:1.2.840.114350.1.13.0.1.7.10.698084.130.657370.19999000',
            code: 'female',
            display: 'female',
          },
        ],
      },
      url: 'http://open.epic.com/FHIR/StructureDefinition/extension/sex-for-clinical-use',
    },
    {
      extension: [
        {
          valueCoding: {
            system: 'urn:oid:2.16.840.1.113883.6.238',
            code: '2131-1',
            display: 'Other Race',
          },
          url: 'ombCategory',
        },
        {
          valueString: 'Other',
          url: 'text',
        },
      ],
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    },
    {
      extension: [
        {
          valueString: 'Unknown',
          url: 'text',
        },
      ],
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    },
    {
      valueCode: '248152002',
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-sex',
    },
    {
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://loinc.org',
            code: 'LA29519-8',
            display: 'she/her/her/hers/herself',
          },
        ],
      },
      url: 'http://open.epic.com/FHIR/StructureDefinition/extension/calculated-pronouns-to-use-for-text',
    },
  ],
  identifier: [
    {
      use: 'usual',
      type: {
        text: 'CEID',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.3.688884.100',
      value: 'FHR5GKH2C4H5HWP',
    },
    {
      use: 'usual',
      type: {
        text: 'EPIC',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.0',
      value: 'E4007',
    },
    {
      use: 'usual',
      type: {
        text: 'EXTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.698084',
      value: 'Z6129',
    },
    {
      use: 'usual',
      type: {
        text: 'FHIR',
      },
      system: 'http://open.epic.com/FHIR/StructureDefinition/patient-dstu2-fhir-id',
      value: 'TnOZ.elPXC6zcBNFMcFA7A5KZbYxo2.4T-LylRk4GoW4B',
    },
    {
      use: 'usual',
      type: {
        text: 'FHIR STU3',
      },
      system: 'http://open.epic.com/FHIR/StructureDefinition/patient-fhir-id',
      value: 'erXuFYUfucBZaryVksYEcMg3',
    },
    {
      use: 'usual',
      type: {
        text: 'INTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.698084',
      value: '     Z6129',
    },
    {
      use: 'usual',
      type: {
        text: 'EPI',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.5.737384.14',
      value: '203713',
    },
    {
      use: 'usual',
      type: {
        text: 'MYCHARTLOGIN',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.3.878082.110',
      value: 'FHIRCAMILA',
    },
    {
      use: 'usual',
      type: {
        text: 'WPRINTERNAL',
      },
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.878082',
      value: '736',
    },
  ],
  active: true,
  name: [
    {
      use: 'official',
      text: 'Camila Maria Lopez',
      family: 'Lopez',
      given: ['Camila', 'Maria'],
    },
    {
      use: 'usual',
      text: 'Camila Maria Lopez',
      family: 'Lopez',
      given: ['Camila', 'Maria'],
    },
  ],
  telecom: [
    {
      system: 'phone',
      value: '469-555-5555',
      use: 'home',
      rank: 1,
    },
    {
      system: 'phone',
      value: '469-888-8888',
      use: 'work',
      rank: 2,
    },
    {
      system: 'phone',
      value: '469-469-4321',
      use: 'mobile',
      rank: 3,
    },
    {
      system: 'email',
      value: 'jmurugasamy@siddhaai.com',
      rank: 1,
    },
    {
      system: 'email',
      value: 'knixontestemail@epic.com',
    },
  ],
  gender: 'female',
  birthDate: '1987-09-12',
  deceasedBoolean: false,
  address: [
    {
      use: 'home',
      line: ['3268 West Johnson St.', 'Apt 117'],
      city: 'GARLAND',
      district: 'DALLAS',
      state: 'TX',
      postalCode: '75043',
      country: 'US',
      period: {
        start: '2019-05-24',
      },
    },
    {
      use: 'old',
      line: ['3268 West Johnson St.', 'Apt 117'],
      city: 'GARLAND',
      district: 'DALLAS',
      state: 'TX',
      postalCode: '75043',
      country: 'US',
    },
  ],
  maritalStatus: {
    text: 'Married',
  },
  communication: [
    {
      language: {
        coding: [
          {
            system: 'urn:ietf:bcp:47',
            code: 'en',
            display: 'English',
          },
        ],
        text: 'English',
      },
      preferred: true,
    },
  ],
  generalPractitioner: [
    {
      reference: 'Practitioner/eM5CWtq15N0WJeuCet5bJlQ3',
      type: 'Practitioner',
      display: 'Physician Family Medicine, MD',
    },
  ],
  managingOrganization: {
    reference: 'Organization/enRyWnSP963FYDpoks4NHOA3',
    display: 'Epic Hospital System',
  },
};

import {
  AllergyIntolerance,
  Medication,
  MedicationRequest,
  Organization,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';

export const medplumPatientWithoutEpicIdentifier: Patient = {
  resourceType: 'Patient',
  identifier: [
    {
      system: 'http://hl7.org/fhir/sid/us-ssn',
      value: '444222222',
    },
  ],
  name: [
    {
      given: ['Jane'],
      family: 'California',
    },
  ],
  gender: 'female',
  birthDate: '1970-01-01',
  address: [
    {
      use: 'home',
      line: ['123 Main St.'],
      city: 'San Francisco',
      state: 'CA',
      postalCode: '98732',
    },
  ],
  telecom: [
    {
      system: 'phone',
      use: 'mobile',
      value: '555-325-6392',
    },
  ],
};

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

export const epicAllergyIntolerance: AllergyIntolerance = {
  resourceType: 'AllergyIntolerance',
  id: 'eARZpey6BWRZxRZkRpc8OFJ46j3QOFrduk77hYQKWRQnp6GRlpYc2I3BfUN6pz4Anz77ow8.GJh54fUVfm3O8Vw3',
  clinicalStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        version: '4.0.0',
        code: 'active',
        display: 'Active',
      },
    ],
  },
  verificationStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
        version: '4.0.0',
        code: 'unconfirmed',
        display: 'Unconfirmed',
      },
    ],
  },
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '1631000175102',
        display: 'Patient not asked',
      },
    ],
    text: 'Not on File',
  },
  patient: {
    reference: 'Patient/erXuFYUfucBZaryVksYEcMg3',
    display: 'Lopez, Camila Maria',
  },
};

export const epicMedication: Medication = {
  resourceType: 'Medication',
  id: 'ej-bgums0x4N6E0.QqIjJb3kGhOQBVK3lIYjcil9mb9j-ukNrz6P2y90AiDm3R20Y3',
  identifier: [
    {
      use: 'usual',
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.698288',
      value: '70784',
    },
  ],
  code: {
    coding: [
      {
        system: 'urn:oid:2.16.840.1.113883.6.253',
        code: '100899',
      },
      {
        system: 'urn:oid:2.16.840.1.113883.6.68',
        code: '25990002150316',
      },
      {
        system: 'urn:oid:2.16.840.1.113883.6.162',
        code: '49431',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '4124',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '11636',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '630734',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '748794',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '748798',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '840781',
      },
    ],
    text: 'drospirenone-ethinyl estradiol (YAZ,GIANVI) tablet 3-0.02 mg',
  },
  form: {
    coding: [
      {
        system: 'urn:oid:1.2.840.114350.1.13.0.1.7.4.698288.310',
        code: 'TABS',
        display: 'tablet',
      },
    ],
    text: 'tablet',
  },
  ingredient: [
    {
      itemCodeableConcept: {
        coding: [
          {
            system: 'urn:oid:2.16.840.1.113883.6.253',
            code: '100899',
          },
          {
            system: 'urn:oid:2.16.840.1.113883.6.68',
            code: '25990002150316',
          },
          {
            system: 'urn:oid:2.16.840.1.113883.6.162',
            code: '49431',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '4124',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '11636',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '630734',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '748794',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '748798',
          },
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '840781',
          },
        ],
        text: 'drospirenone-ethinyl estradiol (YAZ,GIANVI) tablet 3-0.02 mg',
      },
    },
  ],
};

export const epicMedicationRequest: MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'ePDJ.zsf3Jfg2.MKkAMgW9EcIbsaiB.y-OTrPS5v2h8Q3',
  identifier: [
    {
      use: 'usual',
      system: 'urn:oid:1.2.840.114350.1.13.0.1.7.2.798268',
      value: '1066899',
    },
  ],
  status: 'active',
  intent: 'order',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-category',
          code: 'community',
          display: 'Community',
        },
      ],
      text: 'Community',
    },
  ],
  medicationReference: {
    reference: 'Medication/ej-bgums0x4N6E0.QqIjJb3kGhOQBVK3lIYjcil9mb9j-ukNrz6P2y90AiDm3R20Y3',
    display: 'drospirenone-ethinyl estradiol (YAZ,GIANVI) tablet 3-0.02 mg',
  },
  subject: {
    reference: 'Patient/erXuFYUfucBZaryVksYEcMg3',
    display: 'Lopez, Camila Maria',
  },
  authoredOn: '2019-05-28',
  requester: {
    reference: 'Practitioner/eM5CWtq15N0WJeuCet5bJlQ3',
    type: 'Practitioner',
    display: 'Physician Family Medicine, MD',
  },
  recorder: {
    reference: 'Practitioner/eM5CWtq15N0WJeuCet5bJlQ3',
    type: 'Practitioner',
    display: 'Physician Family Medicine, MD',
  },
  reasonCode: [
    {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '69878008',
          display: 'Polycystic ovaries (disorder)',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-9-cm',
          code: '256.4',
          display: 'Polycystic ovaries',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-10-cm',
          code: 'E28.2',
          display: 'Polycystic ovarian syndrome',
        },
      ],
      text: 'PCOS (polycystic ovarian syndrome)',
    },
  ],
  courseOfTherapyType: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/medicationrequest-course-of-therapy',
        code: 'continuous',
        display: 'Continuous long term therapy',
      },
    ],
    text: 'Continuous long term therapy',
  },
  dosageInstruction: [
    {
      text: 'Take 1 tablet by mouth 1 (one) time each day., Starting Tue 5/28/2019, Until Wed 5/27/2020, Normal',
      patientInstruction: 'Take 1 tablet by mouth 1 (one) time each day.',
      timing: {
        repeat: {
          boundsPeriod: {
            start: '2019-05-28',
          },
          count: 365,
          timeOfDay: ['09:00:00'],
        },
        code: {
          text: '0900',
        },
      },
      asNeededBoolean: false,
      route: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '260548002',
            display: 'Oral (qualifier value)',
          },
          {
            system: 'urn:oid:1.2.840.114350.1.13.0.1.7.4.798268.7025',
            code: '15',
            display: 'Oral',
          },
        ],
        text: 'Oral',
      },
      method: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '419652001',
            display: 'Take',
          },
        ],
        text: 'Take',
      },
      doseAndRate: [
        {
          type: {
            coding: [
              {
                system: 'http://epic.com/CodeSystem/dose-rate-type',
                code: 'calculated',
                display: 'calculated',
              },
            ],
            text: 'calculated',
          },
          doseQuantity: {
            value: 1,
            unit: 'tablet',
            system: 'http://unitsofmeasure.org',
            code: '{tbl}',
          },
        },
        {
          type: {
            coding: [
              {
                system: 'http://epic.com/CodeSystem/dose-rate-type',
                code: 'admin-amount',
                display: 'admin-amount',
              },
            ],
            text: 'admin-amount',
          },
          doseQuantity: {
            value: 1,
            unit: 'tablet',
            system: 'http://unitsofmeasure.org',
            code: '{tbl}',
          },
        },
        {
          type: {
            coding: [
              {
                system: 'http://epic.com/CodeSystem/dose-rate-type',
                code: 'ordered',
                display: 'ordered',
              },
            ],
            text: 'ordered',
          },
          doseQuantity: {
            value: 1,
            unit: 'tablet',
            system: 'http://unitsofmeasure.org',
            code: '{tbl}',
          },
        },
      ],
    },
  ],
  dispenseRequest: {
    validityPeriod: {
      start: '2019-05-28',
    },
    numberOfRepeatsAllowed: 12,
    quantity: {
      value: 28,
      unit: 'tablet',
    },
    expectedSupplyDuration: {
      value: 28,
      unit: 'Day',
      system: 'http://unitsofmeasure.org',
      code: 'd',
    },
  },
};

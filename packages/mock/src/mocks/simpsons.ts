import { ContentType, SNOMED, UCUM, createReference } from '@medplum/core';
import {
  Address,
  Communication,
  DiagnosticReport,
  Encounter,
  Group,
  Media,
  Observation,
  Patient,
  RelatedPerson,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';

const SIMPSONS_ADDRESS: Address = {
  use: 'home',
  line: ['742 Evergreen Terrace'],
  city: 'Springfield',
  state: 'IL',
  postalCode: '12345',
};

export const LisaSimpson: Patient = {
  resourceType: 'Patient',
  id: 'lisa-simpson',
  meta: {
    versionId: '1',
    lastUpdated: '2020-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  birthDate: '1981-05-09',
  name: [
    {
      given: ['Lisa'],
      family: 'Simpson',
    },
  ],
  photo: [
    {
      contentType: 'image/jpeg',
      url: 'https://example.com/picture.jpg',
    },
  ],
  contact: [
    {
      name: { given: ['Homer'], family: 'Simpson' },
      address: {
        use: 'home',
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '12345',
      },
      telecom: [
        {
          system: 'phone',
          use: 'home',
          value: '555-1239',
        },
        {
          system: 'email',
          use: 'home',
          value: 'homer@thesimpsons.com',
        },
      ],
    },
    {
      name: { given: ['Marge'], family: 'Simpson' },
      address: {
        use: 'home',
        line: ['742 Evergreen Terrace'],
        city: 'Springfield',
        state: 'IL',
        postalCode: '12345',
      },
      telecom: [
        {
          system: 'phone',
          use: 'mobile',
          value: '139-1928',
        },
        {
          system: 'email',
          use: 'home',
          value: 'marge@thesimpsons.com',
        },
      ],
    },
  ],

  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-1239',
    },
    {
      system: 'email',
      use: 'home',
      value: 'lisa@thesimpsons.com',
    },
  ],
};

export const BartSimpson: Patient = {
  resourceType: 'Patient',
  id: '555',
  meta: {
    versionId: '1',
    lastUpdated: '2020-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  birthDate: '1979-12-17',
  name: [
    {
      given: ['Bart'],
      family: 'Simpson',
    },
  ],
  photo: [
    {
      contentType: 'image/jpeg',
      url: 'https://example.com/picture.jpg',
    },
  ],
  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-1239',
    },
    {
      system: 'email',
      use: 'home',
      value: 'bart@thesimpsons.com',
    },
  ],
};

export const HomerLisaRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'homer-lisa-related-person',
  patient: createReference(LisaSimpson),
  address: [SIMPSONS_ADDRESS],
  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-7334',
    },
    {
      system: 'email',
      use: 'home',
      value: 'chunkylover53@aol.com',
    },
  ],
  relationship: [
    {
      text: 'father',
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'FTH', display: 'father' }],
    },
  ],
};

export const HomerBartRelatedPerson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  id: 'homer-bart-related-person',
  patient: createReference(BartSimpson),
  address: [SIMPSONS_ADDRESS],
  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-7334',
    },
    {
      system: 'email',
      use: 'home',
      value: 'chunkylover53@aol.com',
    },
  ],
  relationship: [
    {
      text: 'father',
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'FTH', display: 'father' }],
    },
  ],
};

export const HomerSimpson: Patient = {
  resourceType: 'Patient',
  id: '123',
  gender: 'male',
  meta: {
    versionId: '2',
    lastUpdated: '2020-01-02T00:00:00.000Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  identifier: [
    { system: 'abc', value: '123' },
    { system: 'def', value: '456' },
  ],
  active: true,
  birthDate: '1956-05-12',
  name: [
    {
      given: ['Homer'],
      family: 'Simpson',
    },
  ],
  photo: [
    {
      contentType: ContentType.PNG,
      url: 'https://www.medplum.com/img/homer-simpson.png',
    },
  ],
  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-7334',
    },
    {
      system: 'email',
      use: 'home',
      value: 'chunkylover53@aol.com',
    },
  ],
  address: [
    {
      use: 'home',
      line: ['742 Evergreen Terrace'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '12345',
    },
  ],
  link: [
    { other: createReference(HomerLisaRelatedPerson), type: 'seealso' },
    { other: createReference(HomerBartRelatedPerson), type: 'seealso' },
  ],
};

export const MargeSimpson: Patient = {
  resourceType: 'Patient',
  id: 'marge-simpson',
  gender: 'female',

  active: true,
  birthDate: '1961-08-23',
  name: [
    {
      given: ['Marge'],
      family: 'Simpson',
    },
  ],
  telecom: [
    {
      system: 'phone',
      use: 'home',
      value: '555-7334',
    },
    {
      system: 'email',
      use: 'home',
      value: 'margesimpson@aol.com',
    },
  ],
  address: [SIMPSONS_ADDRESS],
};

export const HomerSimpsonPreviousVersion: Patient = {
  resourceType: 'Patient',
  id: '123',
  meta: {
    versionId: '1',
    lastUpdated: '2020-01-01T00:00:00.000Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  name: [
    {
      given: ['Homer'],
      family: 'Simpson',
    },
  ],
  photo: [
    {
      contentType: ContentType.PNG,
      url: 'https://www.medplum.com/img/homer-simpson.png',
    },
  ],
};

export const HomerEncounter: Encounter = {
  resourceType: 'Encounter',
  id: '123',
  meta: {
    versionId: '456',
    lastUpdated: '2020-01-01T00:00:00.000Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  status: 'finished',
  class: { code: 'AMB', display: 'ambulatory' },
};

export const HomerCommunication: Communication = {
  resourceType: 'Communication',
  id: '123',
  meta: {
    lastUpdated: '2020-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  status: 'completed',
  encounter: createReference(HomerEncounter),
  payload: [
    {
      contentString: 'Hello world',
    },
  ],
};

export const HomerMedia: Media = {
  resourceType: 'Media',
  id: '123',
  meta: {
    lastUpdated: '2020-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  status: 'completed',
  encounter: createReference(HomerEncounter),
  content: {
    contentType: ContentType.TEXT,
    url: 'https://example.com/test.txt',
  },
};

export const HomerObservation1: Observation = {
  resourceType: 'Observation',
  id: '1',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    coding: [{ code: 'test', system: 'http://example.com' }],
    text: 'Test 1',
  },
  valueString: 'test',
};

export const HomerObservation2: Observation = {
  resourceType: 'Observation',
  id: '2',
  status: 'corrected',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 2',
  },
  valueQuantity: {
    value: 20,
    unit: 'x',
  },
  referenceRange: [
    {
      low: {
        value: 10,
      },
    },
  ],
};

export const HomerObservation3: Observation = {
  resourceType: 'Observation',
  id: '3',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 3',
  },
  valueQuantity: {
    value: 30,
    unit: 'x',
  },
  referenceRange: [
    {
      high: {
        value: 50,
      },
    },
  ],
};

export const HomerObservation4: Observation = {
  resourceType: 'Observation',
  id: '4',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 4',
  },
  valueQuantity: {
    value: 50,
    unit: 'x',
    comparator: '>',
  },
  referenceRange: [
    {
      low: {
        value: 10,
        unit: 'x',
      },
      high: {
        value: 50,
        unit: 'x',
      },
    },
  ],
  interpretation: [
    {
      text: 'HIGH',
    },
  ],
};

export const HomerObservation5: Observation = {
  resourceType: 'Observation',
  id: '5',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 5',
  },
  valueQuantity: {
    value: 100,
    unit: 'x',
  },
  referenceRange: [{}],
  interpretation: [{}],
};

export const HomerObservation6: Observation = {
  resourceType: 'Observation',
  id: '6',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 6',
  },
  component: [
    {
      code: { text: 'Systolic' },
      valueQuantity: {
        value: 110,
        unit: 'mmHg',
        system: UCUM,
      },
    },
    {
      code: { text: 'Diastolic' },
      valueQuantity: {
        value: 75,
        unit: 'mmHg',
        system: UCUM,
      },
    },
  ],
};

export const HomerObservation7: Observation = {
  resourceType: 'Observation',
  id: '7',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 7',
  },
  component: [
    {
      code: { text: 'Glucose' },
      valueQuantity: {
        value: 1000,
        unit: 'mg/dL',
        system: UCUM,
      },
    },
  ],
  interpretation: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: 'HH',
          display: 'Critical high',
        },
      ],
    },
  ],
};

export const HomerObservation8: Observation = {
  resourceType: 'Observation',
  id: '8',
  status: 'final',
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  code: {
    text: 'Test 8',
  },
  component: [
    {
      code: { text: 'HIV' },
      valueString: 'REACTIVE',
    },
  ],
  referenceRange: [
    {
      text: 'NEGATIVE',
    },
  ],
  interpretation: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: 'RR',
          display: 'Reactive',
        },
      ],
    },
  ],
};

export const HomerSimpsonSpecimen: Specimen = {
  id: '123',
  resourceType: 'Specimen',
  subject: createReference(HomerSimpson),
  collection: {
    collectedDateTime: '2020-01-01T12:00:00Z',
  },
  note: [
    { text: 'Specimen hemolyzed. Results may be affected.' },
    { text: 'Specimen lipemic. Results may be affected.' },
  ],
};

export const HomerServiceRequest: ServiceRequest = {
  resourceType: 'ServiceRequest',
  id: '123',
  meta: {
    versionId: '1',
    lastUpdated: '2020-01-01T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  identifier: [
    {
      system: 'https://example.com',
      value: '9001',
    },
  ],
  code: {
    coding: [
      {
        system: SNOMED,
        code: 'SERVICE_REQUEST_CODE',
      },
    ],
  },
  subject: {
    reference: 'Patient/123',
    display: 'Homer Simpson',
  },
  status: 'active',
  intent: 'order',
  orderDetail: [
    {
      text: 'ORDERED',
    },
  ],
  specimen: [createReference(HomerSimpsonSpecimen)],
  authoredOn: '2020-01-01T12:00:00Z',
};

export const HomerDiagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: '123',
  meta: {
    versionId: '1',
    lastUpdated: '2020-01-02T12:00:00Z',
    author: {
      reference: 'Practitioner/123',
    },
  },
  status: 'final',
  code: { text: 'Test Report' },
  subject: createReference(HomerSimpson),
  basedOn: [createReference(HomerServiceRequest)],
  specimen: [createReference(HomerSimpsonSpecimen)],
  resultsInterpreter: [createReference(DrAliceSmith)],
  result: [
    createReference(HomerObservation1),
    createReference(HomerObservation2),
    createReference(HomerObservation3),
    createReference(HomerObservation4),
    createReference(HomerObservation5),
    createReference(HomerObservation6),
    createReference(HomerObservation7),
    createReference(HomerObservation8),
  ],
};

export const SimpsonsFamily: Group = {
  resourceType: 'Group',
  id: 'simpsons-family',
  type: 'person',
  actual: true,
  member: [
    { entity: createReference(HomerSimpson) },
    { entity: createReference(MargeSimpson) },
    { entity: createReference(BartSimpson) },
    { entity: createReference(LisaSimpson) },
  ],
};

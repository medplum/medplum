import { Coverage, Organization, Patient, RelatedPerson } from '@medplum/fhirtypes';
import { getReferenceString } from '@medplum/core';

const blueCross: Organization = {
  resourceType: 'Organization',
  active: true,
  type: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/organization-type',
          code: 'ins',
          display: 'Insurance Company',
        },
      ],
    },
  ],
  name: 'Independence Blue Cross Blue Shield',
};

const soloPatient: Patient = {
  resourceType: 'Patient',
  active: true,
  name: [
    {
      family: 'Smith',
      given: ['John'],
    },
  ],
  gender: 'male',
  birthDate: '1990-08-30',
  telecom: [
    {
      system: 'phone',
      value: '888-555-8439',
      use: 'mobile',
    },
  ],
};

const soloPatientCoverage: Coverage = {
  resourceType: 'Coverage',
  status: 'active',
  beneficiary: {
    reference: getReferenceString(soloPatient),
  },
  payor: [
    {
      reference: getReferenceString(blueCross),
    },
  ],
  subscriber: {
    reference: getReferenceString(soloPatient),
  },
  relationship: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
        code: 'self',
        display: 'Self',
      },
    ],
  },
};

const homerSimipson: Patient = {
  resourceType: 'Patient',
  active: true,
  name: [
    {
      family: 'Simpson',
      given: ['Homer'],
    },
  ],
  gender: 'male',
};

const bartSimpson: Patient = {
  resourceType: 'Patient',
  active: true,
  name: [
    {
      family: 'Simpson',
      given: ['Bart'],
    },
  ],
  gender: 'male',
};

const homerCoverage: Coverage = {
  resourceType: 'Coverage',
  status: 'active',
  subscriber: {
    reference: getReferenceString(homerSimipson),
  },
  beneficiary: {
    reference: getReferenceString(bartSimpson),
  },
  payor: [
    {
      reference: getReferenceString(blueCross),
    },
  ],
  relationship: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
        code: 'self',
        display: 'Self',
      },
    ],
  },
};

const bartCoverage: Coverage = {
  resourceType: 'Coverage',
  status: 'active',
  subscriber: {
    reference: getReferenceString(homerSimipson),
  },
  beneficiary: {
    reference: getReferenceString(bartSimpson),
  },
  payor: [
    {
      reference: getReferenceString(blueCross),
    },
  ],
  relationship: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
        code: 'child',
        display: 'Child',
      },
    ],
  },
};

const lisaSimpson: Patient = {
  resourceType: 'Patient',
  active: true,
  name: [
    {
      family: 'Simpson',
      given: ['Lisa'],
    },
  ],
  gender: 'female',
};

const margeSimpson: RelatedPerson = {
  resourceType: 'RelatedPerson',
  patient: {
    reference: getReferenceString(lisaSimpson),
  },
  relationship: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
          code: 'NMTH',
          display: 'Natural Mother',
        },
      ],
    },
  ],
  gender: 'female',
  name: [
    {
      family: 'Simpson',
      given: ['Marge'],
    },
  ],
};

const lisaCoverage: Coverage = {
  resourceType: 'Coverage',
  status: 'active',
  subscriber: {
    reference: getReferenceString(margeSimpson),
  },
  beneficiary: {
    reference: getReferenceString(lisaSimpson),
  },
  payor: [
    {
      reference: getReferenceString(blueCross),
    },
  ],
  relationship: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
        code: 'child',
        display: 'Child',
      },
    ],
  },
};

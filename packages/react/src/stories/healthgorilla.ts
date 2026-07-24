// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SNOMED, createReference } from '@medplum/core';
import type { DiagnosticReport, Observation, Organization, ServiceRequest } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, TestOrganization } from '@medplum/mock';

export const HealthGorillaObservation1: Observation = {
  resourceType: 'Observation',
  id: 'hg-obs-1',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
        },
      ],
    },
  ],
  code: { text: ' 1234-4 Cholesterol, Total' },
  effectiveDateTime: '2023-09-11T11:24:00+00:00',
  issued: '2023-09-11T09:24:00.000+00:00',
  valueQuantity: {
    value: 9.6,
    unit: 'm/l',
  },
  interpretation: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0078',
          code: 'H',
          display: 'Above high normal',
        },
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: 'H',
          display: 'Above high normal',
        },
        {
          system: 'https://www.healthgorilla.com/observation-interpretation',
          code: 'H',
          display: 'Above high normal',
        },
      ],
      text: 'Above high normal',
    },
  ],
  referenceRange: [
    {
      low: {
        value: 5,
      },
      high: {
        value: 9,
      },
      text: '5.0-9.0',
    },
  ],
};

export const HealthGorillaObservationGroup1: Observation = {
  resourceType: 'Observation',
  id: 'hg-obs-group-1',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
        },
      ],
    },
  ],
  code: { text: 'Example Panel Day 1' },
  effectiveDateTime: '2023-09-11T11:24:00+00:00',
  issued: '2023-09-11T09:24:00.000+00:00',
  subject: createReference(HomerSimpson),
  performer: [createReference(TestOrganization)],
  hasMember: [createReference(HealthGorillaObservation1)],
};

export const HealthGorillaObservation2: Observation = {
  resourceType: 'Observation',
  id: 'hg-obs-2',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
        },
      ],
    },
  ],
  code: { text: ' 1234-4 Cholesterol, Total' },
  effectiveDateTime: '2023-09-11T11:24:00+00:00',
  issued: '2023-09-11T09:24:00.000+00:00',
  valueQuantity: {
    value: 7.0,
    unit: 'm/l',
  },
  interpretation: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0078',
          code: 'N',
          display: 'Normal',
        },
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: 'N',
          display: 'Normal',
        },
        {
          system: 'https://www.healthgorilla.com/observation-interpretation',
          code: 'N',
          display: 'Normal',
        },
      ],
      text: 'Normal',
    },
  ],
  referenceRange: [
    {
      low: {
        value: 5,
      },
      high: {
        value: 9,
      },
      text: '5.0-9.0',
    },
  ],
};

export const HealthGorillaObservationGroup2: Observation = {
  resourceType: 'Observation',
  id: 'hg-obs-group-2',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
          display: 'Laboratory',
        },
      ],
    },
  ],
  code: { text: 'Example Panel Day 2' },
  effectiveDateTime: '2023-09-11T11:24:00+00:00',
  issued: '2023-09-11T09:24:00.000+00:00',
  subject: createReference(HomerSimpson),
  performer: [createReference(TestOrganization)],
  hasMember: [createReference(HealthGorillaObservation2)],
};

// Modeled on a Health Gorilla result imported into Medplum: the report, the
// observation groups, the leaf observations, and the performing labs are all
// standalone resources.
export const HealthGorillaQuestParentLab: Organization = {
  resourceType: 'Organization',
  id: 'hg-quest-parent-lab',
  name: 'HGDX Quest',
};

export const HealthGorillaQuestLabLenexa: Organization = {
  resourceType: 'Organization',
  id: 'hg-quest-lab-lenexa',
  name: 'Quest Diagnostics-Lenexa',
  address: [{ line: ['10101 Renner Blvd'], city: 'Lenexa', state: 'KS', postalCode: '66219-9752' }],
  partOf: createReference(HealthGorillaQuestParentLab),
  contact: [
    {
      purpose: { coding: [{ system: 'http://hl7.org/fhir/contactentity-type', code: 'ADMIN' }] },
      name: { text: 'William Becker D.O., MPH' },
    },
  ],
};

export const HealthGorillaQuestLabSacramento: Organization = {
  resourceType: 'Organization',
  id: 'hg-quest-lab-sacramento',
  name: 'Quest Diagnostics-Sacramento - Northgate',
  address: [{ line: ['3714 Northgate Blvd'], city: 'Sacramento', state: 'CA', postalCode: '95834-1617' }],
  partOf: createReference(HealthGorillaQuestParentLab),
  contact: [
    {
      purpose: { coding: [{ system: 'http://hl7.org/fhir/contactentity-type', code: 'ADMIN' }] },
      name: { text: 'M. Rose Akin, M.D., FCAP' },
    },
  ],
};

export const HealthGorillaQuestObservation1: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-1',
  status: 'final',
  code: {
    coding: [{ system: 'http://loinc.org', code: '56540-8', display: 'GLUTAMIC ACID DECARBOXYLASE 65 AB' }],
    text: 'GLUTAMIC ACID DECARBOXYLASE 65 AB',
  },
  subject: createReference(HomerSimpson),
  performer: [createReference(HealthGorillaQuestLabLenexa)],
  valueQuantity: { value: 5.53, unit: 'IU/ml' },
  interpretation: [
    {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0078', code: 'H', display: 'Above high normal' }],
      text: 'Above high normal',
    },
  ],
  referenceRange: [{ high: { value: 5 }, text: '<5' }],
};

export const HealthGorillaQuestObservation2: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-2',
  status: 'final',
  code: {
    coding: [{ system: 'http://loinc.org', code: '4548-4', display: 'HEMOGLOBIN A1c' }],
    text: 'HEMOGLOBIN A1c',
  },
  subject: createReference(HomerSimpson),
  performer: [createReference(HealthGorillaQuestLabSacramento)],
  valueQuantity: { value: 6.652, unit: '% of total Hgb' },
  referenceRange: [{ high: { value: 5.7 }, text: '<5.7' }],
};

export const HealthGorillaQuestObservation3: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-3',
  status: 'final',
  code: {
    coding: [{ system: 'http://loinc.org', code: '13950-1', display: 'HEPATITIS A IGM' }],
    text: 'HEPATITIS A IGM',
  },
  subject: createReference(HomerSimpson),
  // Same performing lab as HealthGorillaQuestObservation1
  performer: [createReference(HealthGorillaQuestLabLenexa)],
  valueString: 'NON-REACTIVE',
  referenceRange: [{ text: 'NON-REACTIVE' }],
};

export const HealthGorillaQuestObservationGroup1: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-group-1',
  status: 'final',
  code: { text: 'GLUTAMIC ACID DECARBOXYLASE 65 AB' },
  subject: createReference(HomerSimpson),
  performer: [createReference(HealthGorillaQuestParentLab)],
  hasMember: [createReference(HealthGorillaQuestObservation1)],
};

export const HealthGorillaQuestObservationGroup2: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-group-2',
  status: 'final',
  code: { text: 'HEMOGLOBIN A1c' },
  subject: createReference(HomerSimpson),
  performer: [createReference(HealthGorillaQuestParentLab)],
  hasMember: [createReference(HealthGorillaQuestObservation2)],
};

export const HealthGorillaQuestObservationGroup3: Observation = {
  resourceType: 'Observation',
  id: 'hg-quest-obs-group-3',
  status: 'final',
  code: { text: 'HEPATITIS A IGM' },
  subject: createReference(HomerSimpson),
  performer: [createReference(HealthGorillaQuestParentLab)],
  hasMember: [createReference(HealthGorillaQuestObservation3)],
};

export const HealthGorillaQuestServiceRequest: ServiceRequest = {
  resourceType: 'ServiceRequest',
  id: 'hg-quest-service-request-1',
  status: 'completed',
  intent: 'order',
  code: { text: 'GLUTAMIC ACID DECARBOXYLASE 65 AB' },
  subject: createReference(HomerSimpson),
  requester: createReference(DrAliceSmith),
};

export const HealthGorillaQuestDiagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'hg-quest-report-1',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
          code: 'LAB',
          display: 'Laboratory',
        },
      ],
      text: 'Laboratory',
    },
  ],
  code: { text: 'GLUTAMIC ACID DECARBOXYLASE 65 AB, HEMOGLOBIN A1c, HEPATITIS A IGM' },
  subject: createReference(HomerSimpson),
  basedOn: [createReference(HealthGorillaQuestServiceRequest)],
  effectiveDateTime: '2026-07-22T02:47:00Z',
  issued: '2026-07-22T02:47:00Z',
  performer: [createReference(HealthGorillaQuestParentLab)],
  result: [
    createReference(HealthGorillaQuestObservationGroup1),
    createReference(HealthGorillaQuestObservationGroup2),
    createReference(HealthGorillaQuestObservationGroup3),
  ],
};

export const HealthGorillaDiagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'hg-report-1',
  status: 'final',
  code: { text: 'Example Panel' },
  category: [
    {
      coding: [
        {
          system: SNOMED,
          code: '15220000',
          display: 'Laboratory test',
        },
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
          code: 'LAB',
        },
      ],
    },
  ],
  effectiveDateTime: '2023-09-11T11:24:00+00:00',
  issued: '2023-09-11T09:24:00.000+00:00',
  subject: createReference(HomerSimpson),
  performer: [createReference(TestOrganization)],
  result: [createReference(HealthGorillaObservationGroup1), createReference(HealthGorillaObservationGroup2)],
  conclusion: 'All observations within normal limits',
};

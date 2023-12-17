import { SNOMED, createReference } from '@medplum/core';
import { DiagnosticReport, Observation } from '@medplum/fhirtypes';
import { HomerSimpson, TestOrganization } from '@medplum/mock';

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

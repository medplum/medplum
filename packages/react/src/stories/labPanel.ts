// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { DiagnosticReport, Observation, Specimen } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, TestOrganization } from '@medplum/mock';

export const LabPanelSpecimen: Specimen = {
  resourceType: 'Specimen',
  id: 'lab-panel-specimen',
  subject: createReference(HomerSimpson),
  collection: {
    collectedDateTime: '2026-04-08T15:57:01-04:00',
  },
  receivedTime: '2026-04-09T15:36:39-04:00',
};

const common: Observation = {
  resourceType: 'Observation',
  status: 'corrected',
  subject: createReference(HomerSimpson),
  performer: [createReference(TestOrganization)],
  issued: '2026-04-09T16:20:07-04:00',
  code: { text: 'HBA1C' }, // This is a placeholder for the actual code
};

export const Hba1cObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-hba1c',
  code: { text: 'HBA1C' },
  category: [{ text: 'Diabetes' }, { text: '1' }],
  valueQuantity: { value: 3.6, comparator: '<', unit: '%' },
  referenceRange: [{ high: { value: 5.6, unit: '%' } }],
  interpretation: [{ text: 'Normal' }],
  note: [{ text: 'Previously reported as 6.5 % on 4/16/2026, 6:24:49 PM' }],
};

export const CholesterolObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-chol',
  code: { text: 'CHOL' },
  category: [{ text: 'Heart' }, { text: '1' }],
  valueQuantity: { value: 31, comparator: '<', unit: 'mg/dL' },
  referenceRange: [{ high: { value: 199, unit: 'mg/dL' } }],
  interpretation: [{ text: 'Normal' }],
  note: [{ text: 'Previously reported as 99 mg/dL on 4/9/2026, 11:20:07 PM' }],
};

export const CreatObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-creat',
  code: { text: 'CREAT' },
  category: [{ text: 'Kidney' }, { text: '1' }],
  valueQuantity: { value: 0.24, comparator: '<', unit: 'mg/dL' },
  referenceRange: [{ low: { value: 0.6, unit: 'mg/dL' }, high: { value: 1.3, unit: 'mg/dL' } }],
  interpretation: [{ text: 'Low' }],
  note: [{ text: 'Previously reported as 11 mg/dL on 4/23/2026, 11:37:45 PM' }],
};

export const HdlObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-hdl',
  code: { text: 'HDL' },
  category: [{ text: 'Heart' }, { text: '1' }],
  valueQuantity: { value: 20, comparator: '<', unit: 'mg/dL' },
  referenceRange: [{ low: { value: 60, unit: 'mg/dL' } }],
  interpretation: [{ text: 'Low' }],
  note: [
    { text: 'Previously reported as 200 mg/dL on 6/24/2026, 11:09:16 PM' },
    { text: 'Previously reported as 330 mg/dL on 6/24/2026, 10:43:48 PM' },
  ],
};

export const LdlObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-ldl',
  code: { text: 'LDL' },
  category: [{ text: 'Heart' }, { text: '1' }],
  valueQuantity: { value: 15, unit: 'mg/dL' },
  referenceRange: [{ high: { value: 99, unit: 'mg/dL' } }],
  note: [{ text: 'Previously reported as 54 mg/dL on 4/9/2026, 11:20:07 PM' }],
};

export const TriglycerideObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-trig',
  code: { text: 'TRIG' },
  category: [{ text: 'Heart' }, { text: '1' }],
  valueQuantity: { value: 10, comparator: '<', unit: 'mg/dL' },
  referenceRange: [{ high: { value: 149, unit: 'mg/dL' } }],
  interpretation: [{ text: 'Normal' }],
  note: [{ text: 'Previously reported as 93 mg/dL on 4/9/2026, 11:20:07 PM' }],
};

export const BunObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-bun',
  code: { text: 'BUN' },
  category: [{ text: 'Kidney' }, { text: '1' }],
  valueQuantity: { value: 2, comparator: '<', unit: 'mg/dL' },
  referenceRange: [{ low: { value: 7, unit: 'mg/dL' }, high: { value: 25, unit: 'mg/dL' } }],
  interpretation: [{ text: 'Low' }],
  note: [
    { text: 'Previously reported as 14.5 mg/dL on 4/10/2026, 6:10:38 PM' },
    {
      text: 'Amended result: Specimen was hemolyzed, which may affect result accuracy. Interpret with caution.  This is a test patient record used for validation/training. Results are not for clinical use.',
      authorString: 'Gena Anderson',
    },
  ],
};

export const TshObservation: Observation = {
  ...common,
  id: 'lab-panel-obs-tsh',
  status: 'final',
  code: { text: 'TSH' },
  category: [{ text: 'Thyroid' }, { text: '1' }],
  valueQuantity: { value: 5.88, unit: 'µIU/mL' },
  referenceRange: [{ low: { value: 0.27, unit: 'µIU/mL' }, high: { value: 4.2, unit: 'µIU/mL' } }],
  interpretation: [{ text: 'High' }],
};

export const LabPanelObservations: Observation[] = [
  Hba1cObservation,
  CholesterolObservation,
  CreatObservation,
  HdlObservation,
  LdlObservation,
  TriglycerideObservation,
  BunObservation,
  TshObservation,
];

export const LabPanelDiagnosticReport: DiagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'lab-panel-report',
  status: 'corrected',
  code: { text: 'Lab Panel' },
  subject: createReference(HomerSimpson),
  resultsInterpreter: [createReference(DrAliceSmith)],
  performer: [createReference(TestOrganization)],
  issued: '2026-04-09T16:20:07-04:00',
  specimen: [createReference(LabPanelSpecimen)],
  result: LabPanelObservations.map(createReference),
};

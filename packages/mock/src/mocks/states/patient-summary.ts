// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Typed example screen data, reusable in apps, demos, tests and Storybook.
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { CodeableConcept, Observation, Patient, Quantity, Resource } from '@medplum/fhirtypes';
import { generateMockResources } from '../../generate-mock';
import { createMockState } from '../../mock-state';

const loinc = (code: string, text: string): CodeableConcept => ({
  coding: [{ system: 'http://loinc.org', code, display: text }],
  text,
});
const category = (code: string): CodeableConcept[] => [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code }] },
];
const quantity = (value: number, code: string): Quantity => ({
  value,
  code,
  unit: code,
  system: 'http://unitsofmeasure.org',
});

const patient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'alex',
  name: [{ given: ['Alex'], family: 'Morgan' }],
  gender: 'female',
  birthDate: '1985-06-15',
  address: [{ city: 'Boston', state: 'MA', postalCode: '02110' }],
};
const subject = createReference(patient);
const payer = { resourceType: 'Organization', id: 'payer', name: 'Example Health Plan' } satisfies WithId<Resource>;

// All values involved in a screen filter or display are explicit.
const records: WithId<Resource>[] = [
  {
    resourceType: 'Coverage',
    id: 'coverage',
    status: 'active',
    beneficiary: subject,
    payor: [createReference(payer)],
    subscriberId: 'DEMO-001',
  },
  {
    resourceType: 'Condition',
    id: 'hypertension',
    subject,
    code: { text: 'Hypertension' },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
  },
  {
    resourceType: 'AllergyIntolerance',
    id: 'penicillin',
    patient: subject,
    code: { text: 'Penicillin allergy' },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
    },
    criticality: 'high',
    reaction: [{ manifestation: [{ text: 'Hives' }] }],
  },
  {
    resourceType: 'MedicationRequest',
    id: 'lisinopril',
    status: 'active',
    intent: 'order',
    subject,
    medicationCodeableConcept: { text: 'Lisinopril 10 mg' },
    dosageInstruction: [{ text: 'Take one tablet daily' }],
  },
  {
    resourceType: 'MedicationStatement',
    id: 'vitamin-d',
    status: 'active',
    subject,
    medicationCodeableConcept: { text: 'Vitamin D' },
  },
  {
    resourceType: 'Immunization',
    id: 'influenza',
    occurrenceDateTime: '2020-05-04T12:05:00.000Z',
    status: 'completed',
    patient: subject,
    vaccineCode: { text: 'Influenza vaccine' },
  },
  {
    resourceType: 'Goal',
    id: 'walking',
    lifecycleStatus: 'active',
    subject,
    description: { text: 'Walk for 30 minutes daily' },
  },
  {
    resourceType: 'ServiceRequest',
    id: 'lipid-order',
    status: 'active',
    intent: 'order',
    subject,
    code: loinc('57698-3', 'Lipid panel'),
  },
  {
    resourceType: 'DiagnosticReport',
    id: 'cbc',
    status: 'final',
    subject,
    code: loinc('58410-2', 'Complete blood count'),
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
  },
  {
    resourceType: 'Observation',
    id: 'blood-pressure',
    status: 'final',
    subject,
    category: category('vital-signs'),
    code: loinc('85354-9', 'Blood pressure'),
    component: [
      { code: loinc('8480-6', 'Systolic blood pressure'), valueQuantity: quantity(120, 'mm[Hg]') },
      { code: loinc('8462-4', 'Diastolic blood pressure'), valueQuantity: quantity(80, 'mm[Hg]') },
    ],
  },
  {
    resourceType: 'Observation',
    id: 'heart-rate',
    status: 'final',
    subject,
    category: category('vital-signs'),
    code: loinc('8867-4', 'Heart rate'),
    valueQuantity: quantity(72, '/min'),
  },
  {
    resourceType: 'Observation',
    id: 'smoking',
    status: 'final',
    subject,
    category: category('social-history'),
    code: loinc('72166-2', 'Tobacco smoking status'),
    valueCodeableConcept: {
      text: 'Never smoked tobacco',
      coding: [{ system: 'http://snomed.info/sct', code: '266919005', display: 'Never smoked tobacco' }],
    },
  },
  {
    resourceType: 'Observation',
    id: 'orientation',
    status: 'final',
    subject,
    category: category('social-history'),
    code: loinc('76690-7', 'Sexual orientation'),
    valueCodeableConcept: {
      text: 'Heterosexual',
      coding: [{ system: 'http://snomed.info/sct', code: '20430005', display: 'Heterosexual' }],
    },
  },
];

export const busyPatient = createMockState([patient, payer, ...records], { patient });

const newcomer: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'new-patient',
  name: [{ given: ['Sam'], family: 'Rivera' }],
};
export const newPatient = createMockState([newcomer], { patient: newcomer });

const sick: WithId<Patient> = { resourceType: 'Patient', id: 'priya', name: [{ given: ['Priya'], family: 'Patel' }] };
const well: WithId<Patient> = { resourceType: 'Patient', id: 'mateo', name: [{ given: ['Mateo'], family: 'Garcia' }] };
const wellObservation: WithId<Observation> = {
  resourceType: 'Observation',
  id: 'mateo-heart-rate',
  status: 'final',
  subject: createReference(well),
  category: category('vital-signs'),
  code: loinc('8867-4', 'Heart rate'),
  valueQuantity: quantity(64, '/min'),
};
export const twoPatients = createMockState(
  [
    sick,
    well,
    { resourceType: 'Condition', id: 'priya-asthma', subject: createReference(sick), code: { text: 'Asthma' } },
    {
      resourceType: 'MedicationRequest',
      id: 'priya-albuterol',
      status: 'active',
      intent: 'order',
      subject: createReference(sick),
      medicationCodeableConcept: { text: 'Albuterol inhaler' },
    },
    wellObservation,
  ],
  { sick, well }
);

const generatedPatients = generateMockResources('Patient', 6, {
  fields: ['name.given', 'birthDate'],
  values: { name: [{ family: 'Demo' }] },
});
const generatedObservations = generateMockResources('Observation', 6, {
  values: (index) => ({
    status: 'final',
    subject: createReference(generatedPatients[index]),
    category: category('vital-signs'),
    code: loinc('8867-4', 'Heart rate'),
    valueQuantity: quantity(60 + index, '/min'),
  }),
});
export const sixPatients = createMockState(
  [...generatedPatients, ...generatedObservations],
  Object.fromEntries(generatedPatients.map((resource) => [resource.id, resource]))
);

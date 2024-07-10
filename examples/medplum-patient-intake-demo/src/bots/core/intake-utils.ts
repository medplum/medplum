import { createReference, getReferenceString, LOINC, MedplumClient } from '@medplum/core';
import { CodeableConcept, Coding, Observation, Patient, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

export async function upsertObservation(
  medplum: MedplumClient,
  patient: Patient,
  code: CodeableConcept,
  category: CodeableConcept,
  valueCoding: QuestionnaireResponseItemAnswer | undefined
): Promise<void> {
  if (!valueCoding) {
    return;
  }

  const observation = createObservation(patient, code, category, valueCoding);

  await medplum.upsertResource(observation, {
    code: LOINC + `|${code.coding?.[0].code}`,
    subject: getReferenceString(patient),
  });
}

function createObservation(
  patient: Patient,
  coding: CodeableConcept,
  category: CodeableConcept,
  valueCoding: Coding
): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: coding,
    category: [category],
    valueCodeableConcept: {
      coding: [valueCoding],
    },
  };
}

export const observationCodeMapping: Record<string, CodeableConcept> = {
  housingStatus: { coding: [{ code: '71802-3', system: LOINC, display: 'Housing status' }] },
  educationLevel: { coding: [{ code: '82589-3', system: LOINC, display: 'Highest Level of Education' }] },
  sexualOrientiation: { coding: [{ code: '76690-7', system: LOINC, display: 'Sexual orientation' }] },
};

export const observationCategoryMapping: Record<string, CodeableConcept> = {
  socialHistory: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'social-history',
        display: 'Social History',
      },
    ],
  },
  sdoh: {
    coding: [
      {
        system: 'http://hl7.org/fhir/us/core/CodeSystem/us-core-tags',
        code: 'sdoh',
        display: 'SDOH',
      },
    ],
  },
};

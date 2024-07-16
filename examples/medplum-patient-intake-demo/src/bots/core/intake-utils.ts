import {
  createReference,
  getExtension,
  getReferenceString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
  LOINC,
  MedplumClient,
} from '@medplum/core';
import { CodeableConcept, Coding, Observation, Patient, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

export const extensionURLMapping: Record<string, string> = {
  race: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-ethnicity',
  veteran: HTTP_HL7_ORG + '/fhir/us/military-service/StructureDefinition/military-service-veteran-status',
};

export const observationCodeMapping: Record<string, CodeableConcept> = {
  housingStatus: { coding: [{ code: '71802-3', system: LOINC, display: 'Housing status' }] },
  educationLevel: { coding: [{ code: '82589-3', system: LOINC, display: 'Highest Level of Education' }] },
  sexualOrientiation: { coding: [{ code: '76690-7', system: LOINC, display: 'Sexual orientation' }] },
};

export const observationCategoryMapping: Record<string, CodeableConcept> = {
  socialHistory: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/observation-category',
        code: 'social-history',
        display: 'Social History',
      },
    ],
  },
  sdoh: {
    coding: [
      {
        system: HTTP_HL7_ORG + '/fhir/us/core/CodeSystem/us-core-tags',
        code: 'sdoh',
        display: 'SDOH',
      },
    ],
  },
};

export async function upsertObservation(
  medplum: MedplumClient,
  patient: Patient,
  code: CodeableConcept,
  category: CodeableConcept,
  valueCoding: QuestionnaireResponseItemAnswer | undefined
): Promise<void> {
  const coding = code.coding?.[0];

  if (!valueCoding || !coding) {
    return;
  }

  const observation = createObservation(patient, code, category, valueCoding);

  await medplum.upsertResource(observation, {
    code: `${coding.system}|${coding.code}`,
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

type ValueXAttribute = 'valueCoding' | 'valueBoolean';

export function setExtension(
  patient: Patient,
  url: string,
  valueXAttribute: ValueXAttribute,
  answer: QuestionnaireResponseItemAnswer | undefined
): void {
  let value = answer?.[valueXAttribute];

  if (valueXAttribute === 'valueBoolean') {
    value = !!value;
  }

  if (value === undefined) {
    return;
  }

  const extension = getExtension(patient, url);

  if (extension) {
    Object.assign(extension, { [valueXAttribute]: value });
  } else {
    if (!patient.extension) {
      patient.extension = [];
    }
    patient.extension.push({
      url: url,
      [valueXAttribute]: value,
    });
  }
}

export function addLanguage(patient: Patient, valueCoding: Coding, preferred: boolean = false): void {
  const patientCommunications = patient.communication || [];

  let language = patientCommunications.find(
    (communication) => communication.language.coding?.[0].code === valueCoding?.code
  );

  if (!language) {
    language = {
      language: {
        coding: [valueCoding],
      },
    };
    patientCommunications.push(language);
  }

  if (preferred) {
    language.preferred = preferred;
  }

  patient.communication = patientCommunications;
}

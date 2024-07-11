import {
  createReference,
  getExtension,
  getReferenceString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
  LOINC,
  MedplumClient,
} from '@medplum/core';
import {
  CodeableConcept,
  Coding,
  Observation,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';

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
    (extension as any)[valueXAttribute] = value;
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

export async function addCoverage(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const payor = await medplum.createResource({
    resourceType: 'Organization',
    name: answers['insurance-provider']?.valueString,
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
  });

  await medplum.createResource({
    resourceType: 'Coverage',
    status: 'active',
    beneficiary: createReference(patient),
    subscriberId: answers['subscriber-id']?.valueString,
    relationship: answers['relationship-to-subscriber']?.valueCoding,
    payor: [createReference(payor)],
  });
}

function findQuestionnaireItem(
  items: QuestionnaireItem[] | QuestionnaireResponseItem[] | undefined,
  linkId: string
): QuestionnaireItem | QuestionnaireResponseItem | undefined {
  if (!items) {
    return undefined;
  }

  return items.find((item) => {
    if (item.linkId === linkId) {
      return item;
    } else if (item.item) {
      return findQuestionnaireItem(item.item, linkId);
    }

    return undefined;
  });
}

export function getGroupRepeatedAnswers(
  questionnaire: Questionnaire,
  response: QuestionnaireResponse,
  groupLinkId: string
): Record<string, QuestionnaireResponseItemAnswer>[] {
  const questionnaireItem = findQuestionnaireItem(questionnaire.item, groupLinkId) as QuestionnaireItem;
  const responseItem = findQuestionnaireItem(response.item, groupLinkId) as QuestionnaireResponseItem;

  if (questionnaireItem.type !== 'group' || !questionnaireItem?.item) {
    return [];
  }

  const responses = responseItem.item || [];
  let responseCursor = 0;

  const linkIds = questionnaireItem.item.map((item) => item.linkId);
  let linkCursor = 0;

  const groupAnswers = [];
  let answerGroup = {};

  while (responseCursor < responses.length) {
    const item = responses[responseCursor];

    if (item.linkId === linkIds[linkCursor]) {
      Object.assign(answerGroup, { [item.linkId]: item.answer?.[0] });
      responseCursor += 1;
    }

    linkCursor += 1;
    if (linkCursor >= linkIds?.length) {
      linkCursor = 0;
      groupAnswers.push(answerGroup);
      answerGroup = {};
    }
  }

  if (Object.keys(answerGroup).length > 0) {
    groupAnswers.push(answerGroup);
  }

  return groupAnswers;
}

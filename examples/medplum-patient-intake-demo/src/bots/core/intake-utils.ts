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
  Consent,
  Observation,
  Organization,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';

export const extensionURLMapping: Record<string, string> = {
  race: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-ethnicity',
  veteran: HTTP_HL7_ORG + '/fhir/us/military-service/StructureDefinition/military-service-veteran-status',
};

export const observationCodeMapping: Record<string, CodeableConcept> = {
  housingStatus: { coding: [{ code: '71802-3', system: LOINC, display: 'Housing status' }] },
  educationLevel: { coding: [{ code: '82589-3', system: LOINC, display: 'Highest Level of Education' }] },
  sexualOrientation: { coding: [{ code: '76690-7', system: LOINC, display: 'Sexual orientation' }] },
  pregnancyStatus: { coding: [{ code: '82810-3', system: LOINC, display: 'Pregnancy status' }] },
  estimatedDeliveryDate: { coding: [{ code: '11778-8', system: LOINC, display: 'Estimated date of delivery' }] },
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

export const consentScopeMapping: Record<string, CodeableConcept> = {
  adr: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'adr',
        display: 'Advanced Care Directive',
      },
    ],
  },
  patientPrivacy: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'patient-privacy',
        display: 'Patient Privacy',
      },
    ],
  },
  treatment: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentscope',
        code: 'treatment',
        display: 'Treatment',
      },
    ],
  },
};

export const consentCategoryMapping: Record<string, CodeableConcept> = {
  acd: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentcategorycodes',
        code: 'acd',
        display: 'Advanced Care Directive',
      },
    ],
  },
  nopp: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'nopp',
        display: 'Notice of Privacy Practices',
      },
    ],
  },
  pay: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'pay',
        display: 'Payment',
      },
    ],
  },
  med: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-ActCode',
        code: 'med',
        display: 'Medical',
      },
    ],
  },
};

export const consentPolicyRuleMapping: Record<string, CodeableConcept> = {
  hipaaNpp: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'hipaa-npp',
        display: 'HIPAA Notice of Privacy Practices',
      },
    ],
  },
  hipaaSelfPay: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'hipaa-self-pay',
        display: 'HIPAA Self-Pay Restriction',
      },
    ],
  },
  cric: {
    coding: [
      {
        system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/consentpolicycodes',
        code: 'cric',
        display: 'Common Rule Informed Consent',
      },
    ],
  },
  adr: {
    coding: [
      {
        system: 'http://medplum.com',
        code: 'BasicADR',
        display: 'Advanced Care Directive',
      },
    ],
  },
};

type ObservationQuestionnaireItemType = 'valueCodeableConcept' | 'valueDateTime';

/**
 * This function takes data about an Observation and creates or updates an existing
 * resource with the same patient and code.
 *
 * @param medplum - A Medplum client
 * @param patient - A Patient resource that will be stored as the subject
 * @param code - A code for the observation
 * @param category - A category for the observation
 * @param answerType - The value[x] field where the answer should be stored
 * @param value - The value to be stored in the observation
 */
export async function upsertObservation(
  medplum: MedplumClient,
  patient: Patient,
  code: CodeableConcept,
  category: CodeableConcept,
  answerType: ObservationQuestionnaireItemType,
  value: QuestionnaireResponseItemAnswer | undefined
): Promise<void> {
  if (!value || !code) {
    return;
  }

  const observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: code,
    category: [category],
  };

  if (answerType === 'valueCodeableConcept') {
    observation.valueCodeableConcept = {
      coding: [value],
    };
  } else if (answerType === 'valueDateTime') {
    observation.valueDateTime = value.valueDateTime;
  }

  const coding = code.coding?.[0] as Coding;
  await medplum.upsertResource(observation, {
    code: `${coding.system}|${coding.code}`,
    subject: getReferenceString(patient),
  });
}

type ExtensionQuestionnaireItemType = 'valueCoding' | 'valueBoolean';

/**
 * Sets an extension to a patient
 *
 * @param patient - A patient resource
 * @param url - An URL that identifies the extension
 * @param answerType - The value[x] field where the answer should be stored
 * @param answer - The value to be stored in the extension
 */
export function setExtension(
  patient: Patient,
  url: string,
  answerType: ExtensionQuestionnaireItemType,
  answer: QuestionnaireResponseItemAnswer | undefined
): void {
  let value = answer?.[answerType];

  // Answer to boolean Questionnaire fields will be set as `undefined` if the check mark is not ticked
  // so in this case we should interpret it as `false`.
  if (answerType === 'valueBoolean') {
    value = !!value;
  }

  if (value === undefined) {
    return;
  }

  const extension = getExtension(patient, url);

  if (extension) {
    // Update the value if there's already an extension for the URL
    Object.assign(extension, { [answerType]: value });
  } else {
    if (!patient.extension) {
      patient.extension = [];
    }

    // Add a new extension if there isn't one
    patient.extension.push({
      url: url,
      [answerType]: value,
    });
  }
}

/**
 * Add a language to patient's communication attribute or set an existing one as preferred
 *
 * @param patient - The patient
 * @param valueCoding - A Coding with the language data
 * @param preferred - Whether this language should be set as preferred
 */
export function addLanguage(patient: Patient, valueCoding: Coding | undefined, preferred: boolean = false): void {
  if (!valueCoding) {
    return;
  }

  const patientCommunications = patient.communication ?? [];

  // Checks if the patient already has the language in their list of communications
  let language = patientCommunications.find(
    (communication) => communication.language.coding?.[0].code === valueCoding?.code
  );

  // Add the language in case it's not set yet
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

/**
 * Adds a Coverage resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the coverage
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                  coverage (see getGroupRepeatedAnswers)
 */
export async function addCoverage(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const payor = answers['insurance-provider'].valueReference as Reference<Organization>;
  const subscriberId = answers['subscriber-id'].valueString;

  await medplum.upsertResource(
    {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(patient),
      subscriberId: subscriberId,
      relationship: { coding: [answers['relationship-to-subscriber'].valueCoding as Coding] },
      payor: [payor],
    },
    {
      beneficiary: getReferenceString(patient),
      payor: getReferenceString(payor),
    }
  );
}

export async function addConsent(
  medplum: MedplumClient,
  patient: Patient,
  consentGiven: boolean,
  scope: CodeableConcept,
  category: CodeableConcept,
  policyRule: CodeableConcept | undefined,
  date: Consent['dateTime'] | undefined
): Promise<void> {
  await medplum.createResource({
    resourceType: 'Consent',
    patient: createReference(patient),
    status: consentGiven ? 'active' : 'rejected',
    scope: scope,
    category: [category],
    policyRule: policyRule,
    dateTime: date,
  });
}

/**
 * Finds a QuestionnaireItem or QuestionnaireResponseItem with the given linkId
 *
 * @param items - The array of objects present in the `.item` attribute of a Questionnaire or QuestionnaireResponse
 * @param linkId - The id to be found
 * @returns - The found item or undefined in case it's not found
 */
export function findQuestionnaireItem<T extends QuestionnaireItem | QuestionnaireResponseItem>(
  items: T[] | undefined,
  linkId: string
): T | undefined {
  if (!items) {
    return undefined;
  }

  return items.reduce((foundItem: T | undefined, currentItem: T | undefined) => {
    // If currentItem is undefined or the item was already found just return it
    if (foundItem || !currentItem) {
      return foundItem;
    }

    if (currentItem.linkId === linkId) {
      return currentItem;
    } else if (currentItem.item) {
      // This enables traversing nested structures
      return findQuestionnaireItem(currentItem.item as T[], linkId);
    }

    return undefined;
  }, undefined);
}

/**
 * Finds the answers to a group of items that can be repeated.
 *
 * @param questionnaire - The Questionnaire resource, used to find the list of linkIds that will compose each group
 * @param response - The QuestionnaireResponse resource where the answers will be extracted
 * @param groupLinkId - The linkId of the group that can be repeated in the questionnaire
 * @returns - An array of objects each containing a set of grouped answers
 */
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

  const responses = responseItem.item ?? [];
  let responseCursor = 0;

  const linkIds = questionnaireItem.item.map((item) => item.linkId);
  let linkCursor = 0;

  const groupAnswers = [];
  let answerGroup = {};

  // It expects that responses will be organized in the same order the form is filled. Eg.:
  // [
  //   {answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3},
  //   {answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}
  // ]
  // The linkCursor and responseCursor logic allows this function to work even when some fields are
  // not filled. Eg.:
  // [
  //   {answer-with-linkId-1}, {answer-with-linkId-3},
  //   {answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}
  // ]
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

export function convertDateToDateTime(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return new Date(date).toISOString();
}

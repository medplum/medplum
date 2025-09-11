// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString, HTTP_HL7_ORG, MedplumClient, SNOMED } from '@medplum/core';
import {
  Address,
  Coding,
  Condition,
  HumanName,
  Patient,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';

export const PROFILE_URLS: Record<string, string> = {
  AllergyIntolerance: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-allergyintolerance`,
  CareTeam: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-careteam`,
  Coverage: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-coverage`,
  Encounter: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-encounter`,
  Immunization: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-immunization`,
  MedicationRequest: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-medicationrequest`,
  Patient: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-patient`,
  Procedure: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-procedure`,
  ObservationSexualOrientation: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-observation-sexual-orientation`,
  ObservationSmokingStatus: `${HTTP_HL7_ORG}/fhir/us/core/StructureDefinition/us-core-smokingstatus`,
};

export const extensionURLMapping: Record<string, string> = {
  race: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-race',
  ethnicity: HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-ethnicity',
  veteran: HTTP_HL7_ORG + '/fhir/us/military-service/StructureDefinition/military-service-veteran-status',
  patientBirthTime: HTTP_HL7_ORG + '/fhir/StructureDefinition/patient-birthTime',
  // Custom
  encounterDescription: 'https://medplum.com/fhir/StructureDefinition/encounter-description',
  procedureRank: 'https://medplum.com/fhir/StructureDefinition/procedure-rank',
};

type ExtensionQuestionnaireItemType = 'valueCoding' | 'valueBoolean';

/**
 * Add an extension to a patient
 *
 * @param patient - A patient resource
 * @param url - An URL that identifies the extension
 * @param answerType - The value[x] field where the answer should be stored
 * @param answer - The value to be stored in the extension
 * @param subExtensionKey - A key to identify a sub-extension
 */
export function addExtension(
  patient: Patient,
  url: string,
  answerType: ExtensionQuestionnaireItemType,
  answer: QuestionnaireResponseItemAnswer | undefined,
  subExtensionKey?: string
): void {
  let value = answer?.[answerType];

  // Answer to boolean Questionnaire fields will be set as `undefined` if the check mark is not ticked
  // so in this case we should interpret it as `false`.
  if (answerType === 'valueBoolean') {
    value = Boolean(value);
  }

  if (value === undefined) {
    return;
  }

  patient.extension ||= [];

  if (subExtensionKey) {
    const subExtensions = [
      {
        url: subExtensionKey,
        [answerType]: value,
      },
    ];
    if (answerType === 'valueCoding' && (value as Coding).display) {
      subExtensions.push({ url: 'text', valueString: (value as Coding).display as string });
    }
    patient.extension.push({
      url,
      extension: subExtensions,
    });
  } else {
    patient.extension.push({
      url,
      [answerType]: value,
    });
  }
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
  const payerType = answers['payer-type']?.valueCoding;
  const start = answers['payer-period-start']?.valueDateTime;

  if (!payerType || !start) {
    return;
  }

  await medplum.upsertResource(
    {
      resourceType: 'Coverage',
      meta: { profile: [PROFILE_URLS.Coverage] },
      status: 'active',
      beneficiary: createReference(patient),
      payor: [createReference(patient)],
      type: { coding: [payerType] },
      period: { start },
    },
    {
      beneficiary: getReferenceString(patient),
      type: payerType.code,
    }
  );
}

/**
 * Adds an Encounter resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the encounter
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up an
 *                  encounter (see getGroupRepeatedAnswers)
 */
export async function addEncounter(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): Promise<void> {
  const description = answers['encounter-description']?.valueString;
  const type = answers['encounter-code']?.valueCoding;
  const start = answers['encounter-period-start']?.valueDateTime;
  const end = answers['encounter-period-end']?.valueDateTime;

  if (!description || !type || !start || !end) {
    return;
  }

  const duration = new Date(end).getTime() - new Date(start).getTime();
  const lengthInDays = Math.round(duration / (1000 * 60 * 60 * 24));
  const classCode = answers['encounter-class']?.valueCoding ?? {
    system: 'http://terminology.hl7.org/CodeSystem/v3-NullFlavor',
    code: 'UNK',
    display: 'unknown',
  };
  const dischargeDisposition = answers['encounter-discharge-disposition']?.valueCoding;

  const diagnosis = answers['encounter-diagnosis']?.valueCoding;
  const diagnosisRank = answers['encounter-diagnosis-rank']?.valueInteger ?? 1;
  let condition: Condition | undefined;
  if (diagnosis) {
    condition = await medplum.createResource({
      resourceType: 'Condition',
      code: { coding: [diagnosis] },
      subject: createReference(patient),
    });
  }

  await medplum.createResource({
    resourceType: 'Encounter',
    meta: { profile: [PROFILE_URLS.Encounter] },
    status: 'finished',
    class: classCode,
    subject: createReference(patient),
    type: [{ coding: [type] }],
    period: { start, end },
    length: { value: lengthInDays, unit: 'd' },
    extension: [
      {
        url: extensionURLMapping.encounterDescription,
        valueString: description,
      },
    ],
    ...(condition && {
      diagnosis: [{ condition: createReference(condition), rank: diagnosisRank ?? 1 }],
    }),
    ...(dischargeDisposition && {
      hospitalization: {
        dischargeDisposition: { coding: [dischargeDisposition] },
      },
    }),
  });
}

/**
 * Adds a Procedure resource
 *
 * @param medplum - The Medplum client
 * @param patient - The patient beneficiary of the procedure
 * @param answers - A list of objects where the keys are the linkIds of the fields used to set up a
 *                  procedure (see getGroupRepeatedAnswers)
 * @param isIntervention - Whether the procedure is an intervention
 */
export async function addProcedure(
  medplum: MedplumClient,
  patient: Patient,
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  isIntervention: boolean = false
): Promise<void> {
  const category = isIntervention
    ? {
        system: SNOMED,
        code: '409063005',
        display: 'Counselling',
      }
    : {
        system: SNOMED,
        code: '103693007',
        display: 'Diagnostic procedure',
      };
  const code = answers['procedure-code']?.valueCoding;
  const performedDateTime = answers['procedure-performed-datetime']?.valueDateTime;
  const periodStart = answers['procedure-period-start']?.valueDateTime;
  const medicalReason = answers['procedure-medical-reason']?.valueCoding;
  const rank = answers['procedure-rank']?.valueInteger;
  if (!code || !performedDateTime) {
    return;
  }

  await medplum.createResource({
    resourceType: 'Procedure',
    meta: { profile: [PROFILE_URLS.Procedure] },
    status: 'completed',
    subject: createReference(patient),
    category: { coding: [category] },
    code: { coding: [code] },
    performedDateTime: performedDateTime,
    ...(periodStart && {
      performedPeriod: { start: periodStart, end: periodStart },
    }),
    ...(medicalReason && {
      statusReason: { coding: [medicalReason] },
    }),
    ...(rank && {
      extension: [
        {
          url: extensionURLMapping.procedureRank,
          valueInteger: rank,
        },
      ],
    }),
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
  // Find the questionnaire item based on groupLinkId
  const questionnaireItem = findQuestionnaireItem(questionnaire.item, groupLinkId) as QuestionnaireItem;

  if (questionnaireItem?.type !== 'group' || !questionnaireItem?.item) {
    return [];
  }

  // Get all response items corresponding to the groupLinkId
  const responseGroups = response.item?.filter((item) => item.linkId === groupLinkId);

  if (!responseGroups || responseGroups?.length === 0) {
    return [];
  }

  // It expects that responses will be organized in separate groups with the same groupLinkId. Eg.:
  // [
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]},
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]}
  // ]
  // This function handles scenarios where each group can have some fields filled and some not, while keeping the order intact. Eg.:
  // [
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-3}]},
  //   {group-linkId-1: [{answer-with-linkId-1}, {answer-with-linkId-2}, {answer-with-linkId-3}]}
  // ]

  const groupAnswers = responseGroups.map((responseItem) => {
    const answers: Record<string, any> = {};

    const extractAnswers = (items: QuestionnaireResponseItem[]): void => {
      items.forEach(({ linkId, answer, item }) => {
        if (item) {
          const subGroupAnswers: Record<string, any> = {};
          item.forEach((subItem) => {
            if (subItem.answer) {
              subGroupAnswers[subItem.linkId] = subItem.answer?.[0] ?? {};
            }
          });
          answers[linkId] = subGroupAnswers;
        } else {
          answers[linkId] = answer?.[0] ?? {};
        }
      });
    };

    extractAnswers(responseItem.item || []);
    return answers;
  });

  return groupAnswers;
}

export function convertDateToDateTime(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return new Date(date).toISOString();
}

export function getHumanName(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  prefix: string = ''
): HumanName | undefined {
  const patientName: HumanName = {};

  const givenName = [];
  if (answers?.[`${prefix}first-name`]?.valueString) {
    givenName.push(answers[`${prefix}first-name`].valueString as string);
  }
  if (answers?.[`${prefix}middle-name`]?.valueString) {
    givenName.push(answers[`${prefix}middle-name`].valueString as string);
  }

  if (givenName.length > 0) {
    patientName.given = givenName;
  }

  if (answers?.[`${prefix}last-name`]?.valueString) {
    patientName.family = answers[`${prefix}last-name`].valueString;
  }

  return Object.keys(patientName).length > 0 ? patientName : undefined;
}

export function getPatientAddress(answers: Record<string, QuestionnaireResponseItemAnswer>): Address | undefined {
  const patientAddress: Address = {};

  if (answers['street']?.valueString) {
    patientAddress.line = [answers['street'].valueString];
  }

  if (answers['city']?.valueString) {
    patientAddress.city = answers['city'].valueString;
  }

  if (answers['state']?.valueCoding?.code) {
    patientAddress.state = answers['state'].valueCoding.code;
  }

  if (answers['zip']?.valueString) {
    patientAddress.postalCode = answers['zip'].valueString;
  }

  if (answers['country']?.valueString) {
    patientAddress.country = answers['country'].valueString;
  }

  // To simplify the demo, we're assuming the address is always a home address
  return Object.keys(patientAddress).length > 0 ? { use: 'home', type: 'physical', ...patientAddress } : undefined;
}

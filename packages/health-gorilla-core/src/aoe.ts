// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { arrayify, getAllQuestionnaireAnswers, getExtensionValue, getTypedPropertyValue } from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';

/**
 * Edits an AOE Questionnaire from Health Gorilla to make it a valid Questionnaire;
 * most importantly, it sets the linkId to the id if it is not already set.
 * @param aoe - The AOE Questionnaire to normalize.
 * @returns - The normalized input Questionnaire.
 */
export function normalizeAoeQuestionnaire(aoe: Questionnaire): Questionnaire {
  if (aoe.item) {
    for (const item of aoe.item) {
      item.linkId = item.linkId ?? item.id;
      item.initial = item.answerOption ? undefined : item.initial;
    }
  }

  return aoe;
}

/**
 * Checks which required items are missing from a QuestionnaireResponse.
 * @param q - The Questionnaire to check against.
 * @param qr - The QuestionnaireResponse to check.
 * @param includeRequiredWhenSpecimenCollected - Whether to require AOE answers when a specimen is collected.
 * @returns An array of linkIds of missing required items.
 */
export function getMissingRequiredQuestionnaireItems(
  q: Questionnaire,
  qr: QuestionnaireResponse | undefined,
  includeRequiredWhenSpecimenCollected: boolean
): string[] {
  const missing: string[] = [];
  const answersByLinkId: Record<string, QuestionnaireResponseItemAnswer[] | undefined> | undefined =
    qr && getAllQuestionnaireAnswers(qr);

  //TODO it might be better to make NormalizedAoeQuestionnaire a branded type
  // and specify that as the input type to this function
  for (const item of questionnaireItemIterator(normalizeAoeQuestionnaire(q).item)) {
    if (
      item.required ||
      (includeRequiredWhenSpecimenCollected &&
        getExtensionValue(
          item,
          'https://www.healthgorilla.com/fhir/StructureDefinition/questionnaire-requiredwhenspecimen'
        ) === true)
    ) {
      const answers = answersByLinkId?.[item.linkId];
      if (answers && answers.length > 0) {
        let hasValue = false;
        for (const answer of answers) {
          const values = arrayify(
            getTypedPropertyValue({ type: 'QuestionnaireResponseItemAnswer', value: answer }, 'value[x]')
          );
          if (values?.some((v) => v.value)) {
            hasValue = true;
            continue;
          }
        }

        if (hasValue) {
          continue;
        }
      }

      missing.push(item.linkId);
    }
  }

  return missing;
}

export function* questionnaireItemIterator(item: QuestionnaireItem[] | undefined): Generator<QuestionnaireItem> {
  if (!item) {
    return;
  }

  for (const i of item) {
    yield i;
    if (i.item) {
      yield* questionnaireItemIterator(i.item);
    }
  }
}

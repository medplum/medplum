// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  HTTP_HL7_ORG,
  PropertyType,
  TypedValue,
  capitalize,
  deepClone,
  evalFhirPathTyped,
  getExtension,
  getReferenceString,
  getTypedPropertyValueWithoutSchema,
  normalizeErrorString,
  splitN,
  toJsBoolean,
  toTypedValue,
  typedValueToString,
} from '@medplum/core';
import {
  Encounter,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemEnableWhen,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';

export const QuestionnaireItemType = {
  group: 'group',
  display: 'display',
  question: 'question',
  boolean: 'boolean',
  decimal: 'decimal',
  integer: 'integer',
  date: 'date',
  dateTime: 'dateTime',
  time: 'time',
  string: 'string',
  text: 'text',
  url: 'url',
  choice: 'choice',
  openChoice: 'open-choice',
  attachment: 'attachment',
  reference: 'reference',
  quantity: 'quantity',
} as const;
export type QuestionnaireItemType = (typeof QuestionnaireItemType)[keyof typeof QuestionnaireItemType];

export const QUESTIONNAIRE_ITEM_CONTROL_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-itemControl`;
export const QUESTIONNAIRE_REFERENCE_FILTER_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-referenceFilter`;
export const QUESTIONNAIRE_REFERENCE_RESOURCE_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-referenceResource`;
export const QUESTIONNAIRE_VALIDATION_ERROR_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-validationError`;
export const QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL = `${HTTP_HL7_ORG}/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression`;
export const QUESTIONNAIRE_CALCULATED_EXPRESSION_URL = `${HTTP_HL7_ORG}/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression`;
export const QUESTIONNAIRE_SIGNATURE_REQUIRED_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-signatureRequired`;
export const QUESTIONNAIRE_SIGNATURE_RESPONSE_URL = `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaireresponse-signature`;

/**
 * Returns true if the item is a choice question.
 * @param item - The questionnaire item to check.
 * @returns True if the item is a choice question, false otherwise.
 */
export function isChoiceQuestion(item: QuestionnaireItem): boolean {
  return item.type === 'choice' || item.type === 'open-choice';
}

/**
 * Returns true if the questionnaire item is enabled based on the enableWhen conditions or expression.
 * @param item - The questionnaire item to check.
 * @param questionnaireResponse - The questionnaire response to check against.
 * @returns True if the question is enabled, false otherwise.
 */
export function isQuestionEnabled(
  item: QuestionnaireItem,
  questionnaireResponse: QuestionnaireResponse | undefined
): boolean {
  const extensionResult = isQuestionEnabledViaExtension(item, questionnaireResponse);
  if (extensionResult !== undefined) {
    return extensionResult;
  }
  return isQuestionEnabledViaEnabledWhen(item, questionnaireResponse);
}

/**
 * Returns true if the questionnaire item is enabled via an extension expression.
 *
 *   An expression that returns a boolean value for whether to enable the item.
 *   If the expression does not resolve to a boolean, it is considered an error in the design of the Questionnaire.
 *   Form renderer behavior is undefined.
 *   Some tools may attempt to force the value to be a boolean (e.g. is it a non-empty collection, non-null, non-zero - if so, then true).
 *
 * See: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-enableWhenExpression.html
 *
 * @param item - The questionnaire item to check.
 * @param questionnaireResponse - The questionnaire response to check against.
 * @returns True if the question is enabled via an extension expression, false otherwise.
 */
function isQuestionEnabledViaExtension(
  item: QuestionnaireItem,
  questionnaireResponse: QuestionnaireResponse | undefined
): boolean | undefined {
  const extension = getExtension(item, QUESTIONNAIRE_ENABLED_WHEN_EXPRESSION_URL);
  if (questionnaireResponse && extension) {
    const expression = extension.valueExpression?.expression;
    if (expression) {
      const value = toTypedValue(questionnaireResponse);
      const result = evalFhirPathTyped(expression, [value], { '%resource': value });
      return toJsBoolean(result);
    }
  }
  return undefined;
}

/**
 * Returns true if the questionnaire item is enabled based on the enableWhen conditions.
 *
 * See: https://hl7.org/fhir/R4/questionnaire-definitions.html#Questionnaire.item.enableWhen
 * See: https://hl7.org/fhir/R4/questionnaire-definitions.html#Questionnaire.item.enableBehavior
 *
 * @param item - The questionnaire item to check.
 * @param questionnaireResponse - The questionnaire response to check against.
 * @returns True if the question is enabled based on the enableWhen conditions, false otherwise.
 */
function isQuestionEnabledViaEnabledWhen(
  item: QuestionnaireItem,
  questionnaireResponse: QuestionnaireResponse | undefined
): boolean {
  if (!item.enableWhen) {
    return true;
  }

  const enableBehavior = item.enableBehavior ?? 'any';
  for (const enableWhen of item.enableWhen) {
    const actualAnswers = getByLinkId(questionnaireResponse?.item, enableWhen.question as string);

    if (enableWhen.operator === 'exists' && !enableWhen.answerBoolean && !actualAnswers?.length) {
      if (enableBehavior === 'any') {
        return true;
      } else {
        continue;
      }
    }
    const { anyMatch, allMatch } = checkAnswers(enableWhen, actualAnswers, enableBehavior);

    if (enableBehavior === 'any' && anyMatch) {
      return true;
    }
    if (enableBehavior === 'all' && !allMatch) {
      return false;
    }
  }

  return enableBehavior !== 'any';
}

/**
 * Evaluates the calculated expressions in a questionnaire.
 * Updates response item answers in place with the calculated values.
 *
 * See: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-calculatedExpression.html
 *
 * @param items - The questionnaire items to evaluate.
 * @param response - The questionnaire response to evaluate against.
 * @param responseItems - The response items to update.
 */
export function evaluateCalculatedExpressionsInQuestionnaire(
  items: QuestionnaireItem[],
  response: QuestionnaireResponse,
  responseItems: QuestionnaireResponseItem[] | undefined = response.item
): void {
  for (const item of items) {
    const responseItem = responseItems?.find((r) => r.linkId === item.linkId);
    if (responseItem) {
      evaluateQuestionnaireItemCalculatedExpressions(response, item, responseItem);
      if (item.item && responseItem.item) {
        // If the item has nested items, evaluate their calculated expressions as well
        evaluateCalculatedExpressionsInQuestionnaire(item.item, response, responseItem.item);
      }
    }
  }
}

function evaluateQuestionnaireItemCalculatedExpressions(
  response: QuestionnaireResponse,
  item: QuestionnaireItem,
  responseItem: QuestionnaireResponseItem
): void {
  try {
    const calculatedValue = evaluateCalculatedExpression(item, response);
    if (!calculatedValue) {
      return;
    }
    const answer = typedValueToResponseItem(item, calculatedValue);
    if (!answer) {
      return;
    }
    responseItem.answer = [answer];
  } catch (error) {
    responseItem.extension = [
      {
        url: QUESTIONNAIRE_VALIDATION_ERROR_URL,
        valueString: `Expression evaluation failed: ${normalizeErrorString(error)}`,
      },
    ];
  }
}

const questionnaireItemTypesAllowedPropertyTypes: Record<string, string[]> = {
  [QuestionnaireItemType.boolean]: [PropertyType.boolean],
  [QuestionnaireItemType.date]: [PropertyType.date],
  [QuestionnaireItemType.dateTime]: [PropertyType.dateTime],
  [QuestionnaireItemType.time]: [PropertyType.time],
  [QuestionnaireItemType.url]: [PropertyType.string, PropertyType.uri, PropertyType.url],
  [QuestionnaireItemType.attachment]: [PropertyType.Attachment],
  [QuestionnaireItemType.reference]: [PropertyType.Reference],
  [QuestionnaireItemType.quantity]: [PropertyType.Quantity],
  [QuestionnaireItemType.decimal]: [PropertyType.decimal, PropertyType.integer],
  [QuestionnaireItemType.integer]: [PropertyType.decimal, PropertyType.integer],
} as const;

export function typedValueToResponseItem(
  item: QuestionnaireItem,
  value: TypedValue
): QuestionnaireResponseItemAnswer | undefined {
  if (!item.type) {
    return undefined;
  }
  if (item.type === QuestionnaireItemType.choice || item.type === QuestionnaireItemType.openChoice) {
    // Choice and open-choice items can have multiple answer options
    return { [`value${capitalize(value.type)}`]: value.value };
  }
  if (item.type === QuestionnaireItemType.string || item.type === QuestionnaireItemType.text) {
    // Always coerce string values to valueString
    if (typeof value.value === 'string') {
      return { valueString: value.value };
    }
    return undefined;
  }
  const allowedPropertyTypes = questionnaireItemTypesAllowedPropertyTypes[item.type];
  if (allowedPropertyTypes?.includes(value.type)) {
    // Use the questionnaire item type to determine the response item type
    return { [`value${capitalize(item.type)}`]: value.value };
  }
  return undefined;
}

function evaluateCalculatedExpression(
  item: QuestionnaireItem,
  response: QuestionnaireResponse | undefined
): TypedValue | undefined {
  if (!response) {
    return undefined;
  }

  const extension = getExtension(item, QUESTIONNAIRE_CALCULATED_EXPRESSION_URL);
  if (extension) {
    const expression = extension.valueExpression?.expression;
    if (expression) {
      const value = toTypedValue(response);
      const result = evalFhirPathTyped(expression, [value], { '%resource': value });
      return result.length !== 0 ? result[0] : undefined;
    }
  }
  return undefined;
}

export function getNewMultiSelectValues(
  selected: string[],
  propertyName: string,
  item: QuestionnaireItem
): QuestionnaireResponseItemAnswer[] {
  const result: QuestionnaireResponseItemAnswer[] = [];

  for (const selectedStr of selected) {
    const option = item.answerOption?.find(
      (candidate) => typedValueToString(getItemAnswerOptionValue(candidate)) === selectedStr
    );
    if (option) {
      const optionValue = getItemAnswerOptionValue(option);
      if (optionValue) {
        result.push({ [propertyName]: optionValue.value });
      }
    }
  }

  return result;
}

function getByLinkId(
  responseItems: QuestionnaireResponseItem[] | undefined,
  linkId: string
): QuestionnaireResponseItemAnswer[] | undefined {
  if (!responseItems) {
    return undefined;
  }

  for (const response of responseItems) {
    if (response.linkId === linkId) {
      return response.answer;
    }
    if (response.item) {
      const nestedAnswer = getByLinkId(response.item, linkId);
      if (nestedAnswer) {
        return nestedAnswer;
      }
    }
  }

  return undefined;
}

function evaluateMatch(actualAnswer: TypedValue | undefined, expectedAnswer: TypedValue, operator?: string): boolean {
  // We handle exists separately since its so different in terms of comparisons than the other mathematical operators
  if (operator === 'exists') {
    // if actualAnswer is not undefined, then exists: true passes
    // if actualAnswer is undefined, then exists: false passes
    return !!actualAnswer === expectedAnswer.value;
  } else if (!actualAnswer) {
    return false;
  } else {
    // `=` and `!=` should be treated as the FHIRPath `~` and `!~`
    // All other operators should be unmodified
    const fhirPathOperator = operator === '=' || operator === '!=' ? operator?.replace('=', '~') : operator;
    const [{ value }] = evalFhirPathTyped(`%actualAnswer ${fhirPathOperator} %expectedAnswer`, [actualAnswer], {
      '%actualAnswer': actualAnswer,
      '%expectedAnswer': expectedAnswer,
    });
    return value;
  }
}

function checkAnswers(
  enableWhen: QuestionnaireItemEnableWhen,
  answers: QuestionnaireResponseItemAnswer[] | undefined,
  enableBehavior: 'any' | 'all'
): { anyMatch: boolean; allMatch: boolean } {
  const actualAnswers = answers || [];
  const expectedAnswer = getItemEnableWhenValueAnswer(enableWhen);

  let anyMatch = false;
  let allMatch = true;

  for (const actualAnswerValue of actualAnswers) {
    const actualAnswer = getResponseItemAnswerValue(actualAnswerValue);
    const { operator } = enableWhen;
    const match = evaluateMatch(actualAnswer, expectedAnswer, operator);
    if (match) {
      anyMatch = true;
    } else {
      allMatch = false;
    }

    if (enableBehavior === 'any' && anyMatch) {
      break;
    }
  }

  return { anyMatch, allMatch };
}

export function getQuestionnaireItemReferenceTargetTypes(item: QuestionnaireItem): ResourceType[] | undefined {
  const extension = getExtension(item, QUESTIONNAIRE_REFERENCE_RESOURCE_URL);
  if (!extension) {
    return undefined;
  }
  if (extension.valueCode !== undefined) {
    return [extension.valueCode] as ResourceType[];
  }
  if (extension.valueCodeableConcept) {
    return extension.valueCodeableConcept?.coding?.map((c) => c.code) as ResourceType[];
  }
  return undefined;
}

export function setQuestionnaireItemReferenceTargetTypes(
  item: QuestionnaireItem,
  targetTypes: ResourceType[] | undefined
): QuestionnaireItem {
  const result = deepClone(item);
  let extension = getExtension(result, QUESTIONNAIRE_REFERENCE_RESOURCE_URL);

  if (!targetTypes || targetTypes.length === 0) {
    if (extension) {
      result.extension = result.extension?.filter((e) => e !== extension);
    }
    return result;
  }

  if (!extension) {
    result.extension ??= [];
    extension = { url: QUESTIONNAIRE_REFERENCE_RESOURCE_URL };
    result.extension.push(extension);
  }

  if (targetTypes.length === 1) {
    extension.valueCode = targetTypes[0];
    delete extension.valueCodeableConcept;
  } else {
    extension.valueCodeableConcept = { coding: targetTypes.map((t) => ({ code: t })) };
    delete extension.valueCode;
  }

  return result;
}

/**
 * Returns the reference filter for the given questionnaire item.
 * @see https://build.fhir.org/ig/HL7/fhir-extensions/StructureDefinition-questionnaire-referenceFilter-definitions.html
 * @param item - The questionnaire item to get the reference filter for.
 * @param subject - Optional subject reference.
 * @param encounter - Optional encounter reference.
 * @returns The reference filter as a map of key/value pairs.
 */
export function getQuestionnaireItemReferenceFilter(
  item: QuestionnaireItem,
  subject: Reference | undefined,
  encounter: Reference<Encounter> | undefined
): Record<string, string> | undefined {
  const extension = getExtension(item, QUESTIONNAIRE_REFERENCE_FILTER_URL);
  if (!extension?.valueString) {
    return undefined;
  }

  // Replace variables
  let filter = extension.valueString;
  if (subject?.reference) {
    filter = filter.replaceAll('$subj', subject.reference);
  }
  if (encounter?.reference) {
    filter = filter.replaceAll('$encounter', encounter.reference);
  }

  // Parse the valueString into a map
  const result: Record<string, string> = {};
  const parts = filter.split('&');
  for (const part of parts) {
    const [key, value] = splitN(part, '=', 2);
    result[key] = value;
  }
  return result;
}

export function buildInitialResponse(
  questionnaire: Questionnaire,
  questionnaireResponse?: QuestionnaireResponse
): QuestionnaireResponse {
  const response: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: questionnaire.url ?? getReferenceString(questionnaire),
    item: buildInitialResponseItems(questionnaire.item, questionnaireResponse?.item),
    status: 'in-progress',
  };

  return response;
}

function buildInitialResponseItems(
  items: QuestionnaireItem[] | undefined,
  responseItems: QuestionnaireResponseItem[] | undefined
): QuestionnaireResponseItem[] | undefined {
  if (!items) {
    return undefined;
  }

  const result = [];
  for (const item of items) {
    if (item.type === QuestionnaireItemType.display) {
      // Display items do not have response items, so we skip them.
      continue;
    }

    const existingResponseItems = responseItems?.filter((responseItem) => responseItem.linkId === item.linkId);
    if (existingResponseItems && existingResponseItems?.length > 0) {
      for (const existingResponseItem of existingResponseItems) {
        // Update existing response item
        existingResponseItem.id = existingResponseItem.id ?? generateId();
        existingResponseItem.text = existingResponseItem.text ?? item.text;
        existingResponseItem.item = buildInitialResponseItems(item.item, existingResponseItem.item);
        existingResponseItem.answer = buildInitialResponseAnswer(item, existingResponseItem);
        result.push(existingResponseItem);
      }
    } else {
      // Add new response item
      result.push(buildInitialResponseItem(item));
    }
  }

  return result;
}

export function buildInitialResponseItem(item: QuestionnaireItem): QuestionnaireResponseItem {
  return {
    id: generateId(),
    linkId: item.linkId,
    text: item.text,
    item: buildInitialResponseItems(item.item, undefined),
    answer: buildInitialResponseAnswer(item),
  };
}

let nextId = 1;
function generateId(): string {
  return 'id-' + nextId++;
}

function buildInitialResponseAnswer(
  item: QuestionnaireItem,
  responseItem?: QuestionnaireResponseItem
): QuestionnaireResponseItemAnswer[] | undefined {
  if (item.type === QuestionnaireItemType.display || item.type === QuestionnaireItemType.group) {
    return undefined;
  }

  if (responseItem?.answer && responseItem.answer.length > 0) {
    // If the response item already has answers, return them as is.
    return responseItem.answer;
  }

  if (item.initial && item.initial.length > 0) {
    // If the item has initial values, return them as answers.
    // This works because QuestionnaireItemInitial and QuestionnaireResponseItemAnswer
    // have the same properties.
    return item.initial.map((initial) => ({ ...initial }));
  }

  if (item.answerOption) {
    return item.answerOption
      .filter((option) => option.initialSelected)
      .map((option) => ({ ...option, initialSelected: undefined }));
  }

  // Otherwise, return undefined to indicate no initial answers.
  return undefined;
}

export function getItemInitialValue(initial: QuestionnaireItemInitial | undefined): TypedValue {
  return getTypedPropertyValueWithoutSchema(
    { type: 'QuestionnaireItemInitial', value: initial },
    'value'
  ) as TypedValue;
}

export function getItemAnswerOptionValue(option: QuestionnaireItemAnswerOption): TypedValue {
  return getTypedPropertyValueWithoutSchema(
    { type: 'QuestionnaireItemAnswerOption', value: option },
    'value'
  ) as TypedValue;
}

export function getItemEnableWhenValueAnswer(enableWhen: QuestionnaireItemEnableWhen): TypedValue {
  return getTypedPropertyValueWithoutSchema(
    { type: 'QuestionnaireItemEnableWhen', value: enableWhen },
    'answer'
  ) as TypedValue;
}

export function getResponseItemAnswerValue(answer: QuestionnaireResponseItemAnswer): TypedValue | undefined {
  return getTypedPropertyValueWithoutSchema({ type: 'QuestionnaireResponseItemAnswer', value: answer }, 'value') as
    | TypedValue
    | undefined;
}

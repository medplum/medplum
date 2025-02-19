import {
  HTTP_HL7_ORG,
  PropertyType,
  TypedValue,
  deepClone,
  evalFhirPathTyped,
  getExtension,
  getReferenceString,
  getTypedPropertyValueWithoutSchema,
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

export enum QuestionnaireItemType {
  group = 'group',
  display = 'display',
  question = 'question',
  boolean = 'boolean',
  decimal = 'decimal',
  integer = 'integer',
  date = 'date',
  dateTime = 'dateTime',
  time = 'time',
  string = 'string',
  text = 'text',
  url = 'url',
  choice = 'choice',
  openChoice = 'open-choice',
  attachment = 'attachment',
  reference = 'reference',
  quantity = 'quantity',
}

export function isChoiceQuestion(item: QuestionnaireItem): boolean {
  return item.type === 'choice' || item.type === 'open-choice';
}

export function isQuestionEnabled(
  item: QuestionnaireItem,
  questionnaireResponse: QuestionnaireResponse | undefined
): boolean {
  const extension = getExtension(
    item,
    HTTP_HL7_ORG + '/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-enableWhenExpression'
  );
  if (questionnaireResponse && extension) {
    const expression = extension.valueExpression?.expression;
    if (expression) {
      const value = toTypedValue(questionnaireResponse);
      const result = evalFhirPathTyped(expression, [value], { '%resource': value });
      return toJsBoolean(result);
    }
  }

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

export function evaluateCalculatedExpressionsInQuestionnaire(
  items: QuestionnaireItem[],
  response: QuestionnaireResponse | undefined
): QuestionnaireResponseItem[] {
  return items
    .map((item): QuestionnaireResponseItem | null => {
      if (item.item) {
        return {
          ...item,
          item: evaluateCalculatedExpressionsInQuestionnaire(item.item, response),
        };
      } else {
        const calculatedValue = evaluateCalculatedExpression(item, response);
        if (!calculatedValue) {
          return null;
        }

        const answer = typedValueToResponseItem(item, calculatedValue);

        if (!answer) {
          return null;
        }

        return {
          id: item?.id,
          linkId: item?.linkId,
          text: item.text,
          answer: [answer],
        };
      }
    })
    .filter((item): item is QuestionnaireResponseItem => item !== null);
}

export function typedValueToResponseItem(
  item: QuestionnaireItem,
  value: TypedValue
): QuestionnaireResponseItemAnswer | undefined {
  if (!item.type) {
    return undefined;
  }

  switch (item.type) {
    case QuestionnaireItemType.boolean:
      return value.type === PropertyType.boolean ? { valueBoolean: value.value } : undefined;
    case QuestionnaireItemType.date:
      return value.type === PropertyType.date ? { valueDate: value.value } : undefined;
    case QuestionnaireItemType.dateTime:
      return value.type === PropertyType.dateTime ? { valueDateTime: value.value } : undefined;
    case QuestionnaireItemType.time:
      return value.type === PropertyType.time ? { valueTime: value.value } : undefined;
    case QuestionnaireItemType.url:
      return value.type === PropertyType.url ? { valueString: value.value } : undefined;
    case QuestionnaireItemType.text:
      return value.type === PropertyType.string ? { valueString: value.value } : undefined;
    case QuestionnaireItemType.attachment:
      return value.type === PropertyType.Attachment ? { valueAttachment: value.value } : undefined;
    case QuestionnaireItemType.reference:
      return value.type === PropertyType.Reference ? { valueReference: value.value } : undefined;
    case QuestionnaireItemType.quantity:
      return { valueQuantity: value.value };
    case QuestionnaireItemType.decimal:
      return { valueDecimal: value.value };
    case QuestionnaireItemType.integer:
      return { valueInteger: value.value };
    case QuestionnaireItemType.string:
      return { valueString: value.value };
    default:
      return undefined;
  }
}

function evaluateCalculatedExpression(
  item: QuestionnaireItem,
  response: QuestionnaireResponse | undefined
): TypedValue | undefined {
  if (!response) {
    return undefined;
  }

  const extension = getExtension(
    item,
    HTTP_HL7_ORG + '/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression'
  );

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

export function mergeUpdatedItems(
  mergedItems: QuestionnaireResponseItem[],
  updatedItems: QuestionnaireResponseItem[]
): QuestionnaireResponseItem[] {
  return mergedItems.map((mergedItem) => {
    const updatedItem = updatedItems.find((updated) => updated.linkId === mergedItem.linkId);

    // Usually fields with calculated expressions would be readOnly in the case where it allows foe manual updates.
    // It would get replaced with content from calcultaed expresion.
    if (updatedItem) {
      return {
        ...mergedItem,
        item: updatedItem.item ? mergeUpdatedItems(mergedItem.item || [], updatedItem.item) : mergedItem.item,
        answer: updatedItem.answer || mergedItem.answer,
      };
    }
    return mergedItem;
  });
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
  const extension = getExtension(item, 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource');
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
  let extension = getExtension(result, 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource');

  if (!targetTypes || targetTypes.length === 0) {
    if (extension) {
      result.extension = result.extension?.filter((e) => e !== extension);
    }
    return result;
  }

  if (!extension) {
    if (!result.extension) {
      result.extension = [];
    }
    extension = { url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource' };
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
 * @see https://build.fhir.org/ig/HL7/fhir-extensions//StructureDefinition-questionnaire-referenceFilter-definitions.html
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
  const extension = getExtension(item, 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter');
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

export function buildInitialResponse(questionnaire: Questionnaire): QuestionnaireResponse {
  const response: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: getReferenceString(questionnaire),
    item: buildInitialResponseItems(questionnaire.item),
    status: 'in-progress',
  };

  return response;
}

function buildInitialResponseItems(items: QuestionnaireItem[] | undefined): QuestionnaireResponseItem[] {
  return items?.map(buildInitialResponseItem) ?? [];
}

export function buildInitialResponseItem(item: QuestionnaireItem): QuestionnaireResponseItem {
  return {
    id: generateId(),
    linkId: item.linkId,
    text: item.text,
    item: buildInitialResponseItems(item.item),
    answer: item.initial?.map(buildInitialResponseAnswer) ?? [],
  };
}

let nextId = 1;
function generateId(): string {
  return 'id-' + nextId++;
}

function buildInitialResponseAnswer(answer: QuestionnaireItemInitial): QuestionnaireResponseItemAnswer {
  // This works because QuestionnaireItemInitial and QuestionnaireResponseItemAnswer
  // have the same properties.
  return { ...answer };
}

/**
 * Returns the number of pages in the questionnaire.
 *
 * By default, a questionnaire is represented as a simple single page questionnaire,
 * so the default return value is 1.
 *
 * If the questionnaire has a page extension on the first item, then the number of pages
 * is the number of top level items in the questionnaire.
 *
 * @param questionnaire - The questionnaire to get the number of pages for.
 * @returns The number of pages in the questionnaire. Default is 1.
 */
export function getNumberOfPages(questionnaire: Questionnaire): number {
  const firstItem = questionnaire?.item?.[0];
  if (firstItem) {
    const extension = getExtension(firstItem, 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl');
    if (extension?.valueCodeableConcept?.coding?.[0]?.code === 'page') {
      return (questionnaire.item as QuestionnaireItem[]).length;
    }
  }
  return 1;
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

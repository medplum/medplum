import { PropertyType } from '@medplum/core';
import { Questionnaire, QuestionnaireItem, QuestionnaireItemInitial } from '@medplum/fhirtypes';

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

/**
 * Adds initial values to a questionnaire resource from key value pairs.
 * The values map uses "linkId" as key.
 * The value depends on the questionnaire item type.
 * @param questionnaire The original questionnaire.
 * @param values Key value pairs for initial values.
 * @returns Rewritten questionnaire with initial values.
 */
export function addQuestionnaireInitialValues(
  questionnaire: Questionnaire,
  values: Record<string, string>
): Questionnaire {
  return {
    ...questionnaire,
    item: addInitialValuesToItemArray(questionnaire.item, values),
  };
}

function addInitialValuesToItemArray(
  items: QuestionnaireItem[] | undefined,
  values: any
): QuestionnaireItem[] | undefined {
  if (!items) {
    return undefined;
  }
  return items.map((item) => addInitialValueToItem(item, values));
}

function addInitialValueToItem(item: QuestionnaireItem, values: Record<string, string>): QuestionnaireItem {
  const { linkId, type } = item;
  if (!linkId || !type) {
    return item;
  }

  if (type === 'group') {
    return {
      ...item,
      item: addInitialValuesToItemArray(item.item, values),
    };
  }

  const suppliedValue = values[linkId];
  if (!suppliedValue) {
    return item;
  }

  let initialValue: QuestionnaireItemInitial | undefined = undefined;
  switch (type) {
    case PropertyType.boolean:
      initialValue = { valueBoolean: suppliedValue === 'true' };
      break;
    case PropertyType.code:
    case PropertyType.Coding:
      initialValue = { valueCoding: { code: suppliedValue } };
      break;
    case PropertyType.date:
      initialValue = { valueDate: suppliedValue };
      break;
    case PropertyType.dateTime:
    case PropertyType.instant:
      initialValue = { valueDateTime: suppliedValue };
      break;
    case PropertyType.decimal:
      initialValue = { valueDecimal: parseFloat(suppliedValue) };
      break;
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      initialValue = { valueInteger: parseInt(suppliedValue) };
      break;
    case PropertyType.SystemString:
    case PropertyType.string:
    case PropertyType.markdown:
      initialValue = { valueString: suppliedValue };
      break;
    case PropertyType.time:
      initialValue = { valueTime: suppliedValue };
      break;
    case PropertyType.uri:
    case PropertyType.url:
      initialValue = { valueUri: suppliedValue };
      break;
    case PropertyType.canonical:
    case PropertyType.Reference:
      initialValue = { valueReference: { reference: suppliedValue } };
      break;
  }

  if (!initialValue) {
    return item;
  }

  return {
    ...item,
    initial: [initialValue],
  };
}

export function isChoiceQuestion(item: QuestionnaireItem): boolean {
  return item.type === 'choice' || item.type === 'open-choice';
}

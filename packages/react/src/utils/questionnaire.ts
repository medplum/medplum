import { TypedValue, evalFhirPathTyped, getTypedPropertyValue } from '@medplum/core';
import { QuestionnaireItem, QuestionnaireItemEnableWhen, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

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
  answers: Record<string, QuestionnaireResponseItemAnswer[]>
): boolean {
  if (!item.enableWhen) {
    return true;
  }

  const enableBehavior = item.enableBehavior ?? 'any';

  for (const enableWhen of item.enableWhen) {
    if (
      enableWhen.operator === 'exists' &&
      !enableWhen.answerBoolean &&
      !answers[enableWhen.question as string]?.length
    ) {
      if (enableBehavior === 'any') {
        return true;
      } else {
        continue;
      }
    }
    const { anyMatch, allMatch } = checkAnswers(enableWhen, answers, enableBehavior);

    if (enableBehavior === 'any' && anyMatch) {
      return true;
    }
    if (enableBehavior === 'all' && !allMatch) {
      return false;
    }
  }

  return enableBehavior !== 'any';
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
      actualAnswer,
      expectedAnswer,
    });
    return value;
  }
}

function checkAnswers(
  enableWhen: QuestionnaireItemEnableWhen,
  answers: Record<string, QuestionnaireResponseItemAnswer[]>,
  enableBehavior: 'any' | 'all'
): { anyMatch: boolean; allMatch: boolean } {
  const actualAnswers = answers[enableWhen.question as string] || [];
  const expectedAnswer = getTypedPropertyValue(
    {
      type: 'QuestionnaireItemEnableWhen',
      value: enableWhen,
    },
    'answer[x]'
  ) as TypedValue;

  let anyMatch = false;
  let allMatch = true;

  for (const actualAnswerValue of actualAnswers) {
    const actualAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireResponseItemAnswer',
        value: actualAnswerValue,
      },
      'value[x]'
    ) as TypedValue | undefined; // possibly undefined when question unanswered
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

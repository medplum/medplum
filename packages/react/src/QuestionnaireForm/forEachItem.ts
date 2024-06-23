import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswerValue,
} from '@medplum/fhirtypes';

type ItemType = QuestionnaireItem | QuestionnaireResponseItem;
type ExtractQuestionnaireType<I> = Extract<Questionnaire | QuestionnaireResponse, { item?: I[] }>;

export interface QuestionnaireFormItemData<R extends ItemType, T> {
  ancestors: R[];
  rootResource: ExtractQuestionnaireType<R>;
  childrenResults: T[];
  currentValues?: Record<string, QuestionnaireResponseItemAnswerValue>;
}
export type ForEachItemCallback<T, R extends QuestionnaireItem | QuestionnaireResponseItem> = (
  item: R,
  itemData: QuestionnaireFormItemData<R, T>
) => T;

export function forEachItem<T, R extends ItemType>(
  resource: ExtractQuestionnaireType<R>,
  callback: ForEachItemCallback<T, R>,
  currentValues?: Readonly<Record<string, QuestionnaireResponseItemAnswerValue>>
): T[] {
  return resource.item?.map((item) => forEachItemImpl(item, resource, callback, currentValues)) ?? [];
}

function forEachItemImpl<T, R extends ItemType>(
  item: R,
  resource: ExtractQuestionnaireType<R>,
  callback: ForEachItemCallback<T, R>,
  currentValues?: Readonly<Record<string, QuestionnaireResponseItemAnswerValue>>,
  ancestors: R[] = []
): T {
  const childrenResults: T[] = [];
  for (const child of item.item ?? []) {
    childrenResults.push(forEachItemImpl(child as R, resource, callback, currentValues, [item, ...ancestors]));
  }
  return callback(item, {
    ancestors,
    rootResource: resource,
    childrenResults,
    currentValues,
  });
}

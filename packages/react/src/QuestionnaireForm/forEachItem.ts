import { isResource } from '@medplum/core';
import { Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';

type ItemType = QuestionnaireItem | QuestionnaireResponseItem;
type ExtractQuestionnaireType<I> = Extract<Questionnaire | QuestionnaireResponse, { item?: I[] }>;

export interface QuestionnaireItemState<R extends ItemType> {
  ancestors: R[];
  resource?: ExtractQuestionnaireType<R>;
}
export type ForEachItemCallback<T, R extends ItemType> = (
  item: R,
  subItemResults: Record<string, T> | undefined,
  state: QuestionnaireItemState<R>
) => T;

export function forEachItem<T, R extends ItemType>(
  resource: ExtractQuestionnaireType<R>,
  callback: ForEachItemCallback<T, R>
): T[];

export function forEachItem<R extends ItemType, T>(
  item: R,
  callback: ForEachItemCallback<T, R>,
  resource?: ExtractQuestionnaireType<R>
): T;

export function forEachItem<T, R extends ItemType>(
  root: ExtractQuestionnaireType<R> | R,
  callback: ForEachItemCallback<T, R>,
  resource?: ExtractQuestionnaireType<R>
): T | T[] {
  let items: R[] = [];
  if (isResource(root)) {
    resource = root;
    items = (root as ExtractQuestionnaireType<R>).item ?? [];
  } else {
    items = [root];
  }
  const result =
    items.map((item) =>
      forEachItemImpl(item, resource, callback, {
        ancestors: [],
        resource: resource,
      })
    ) ?? [];

  if (!isResource(root)) {
    return result?.[0];
  }
  return result;
}

function forEachItemImpl<T, R extends ItemType>(
  item: R,
  resource: ExtractQuestionnaireType<R> | undefined,
  callback: ForEachItemCallback<T, R>,
  state: Readonly<QuestionnaireItemState<R>>
): T {
  const childResults: Record<string, T> | undefined = item.item ? {} : undefined;
  if (childResults) {
    for (const child of item.item ?? []) {
      childResults[child.linkId] = forEachItemImpl(child as R, resource, callback, {
        ...state,
        ancestors: [item, ...state.ancestors],
      });
    }
  }

  return callback(item, childResults, { ...state });
}

import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswerValue,
} from '@medplum/fhirtypes';

type ItemType = QuestionnaireItem | QuestionnaireResponseItem;
type ExtractQuestionnaireType<I> = Extract<Questionnaire | QuestionnaireResponse, { item?: I[] }>;
type Answers = Record<string, QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[]>;

export interface QuestionnaireItemState<R extends ItemType> {
  ancestors: R[];
  rootResource: ExtractQuestionnaireType<R>;
  currentValues?: Readonly<Answers>;
  enabled: boolean;
  readonly: boolean;
}
export type ForEachItemCallback<T, R extends QuestionnaireItem | QuestionnaireResponseItem> = (
  item: R,
  itemState: QuestionnaireItemState<R>,
  childResults: T[]
) => T;

export function forEachItem<T, R extends ItemType>(
  resource: ExtractQuestionnaireType<R>,
  callback: ForEachItemCallback<T, R>,
  currentValues?: Readonly<Answers>
): T[] {
  return (
    resource.item?.map((item) =>
      forEachItemImpl(item, resource, callback, {
        currentValues,
        ancestors: [],
        enabled: true,
        readonly: false,
        rootResource: resource,
      })
    ) ?? []
  );
}

function forEachItemImpl<T, R extends ItemType>(
  item: R,
  resource: ExtractQuestionnaireType<R>,
  callback: ForEachItemCallback<T, R>,
  state: Readonly<QuestionnaireItemState<R>>
): T {
  const childrenResults: T[] = [];
  for (const child of item.item ?? []) {
    childrenResults.push(
      forEachItemImpl(child as R, resource, callback, { ...state, ancestors: [item, ...state.ancestors] })
    );
  }

  return callback(item, state, childrenResults);
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtension } from '@medplum/core';
import {
  Encounter,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
  Signature,
} from '@medplum/fhirtypes';
import { useReducer, useRef } from 'react';
import { useResource } from '../useResource/useResource';
import {
  buildInitialResponse,
  buildInitialResponseItem,
  evaluateCalculatedExpressionsInQuestionnaire,
  QUESTIONNAIRE_ITEM_CONTROL_URL,
  QUESTIONNAIRE_SIGNATURE_RESPONSE_URL,
} from './utils';

// React Hook for Questionnaire Form

// Why is this hard?
// 1. It needs to handle both initial loading of a questionnaire and updating the response as the user interacts with it.
// 2. It needs to support pagination and navigation through the questionnaire.
// 3. It needs to handle complex items like groups and repeatable items.

// Conventions we use:
// 1. We use `QuestionnaireResponse` to track the user's answers.
// 2. We use `QuestionnaireItem` to define the structure of the questionnaire.
// 3. Response items are linked to their corresponding questionnaire items by `linkId`.
// 4. Response items will always have a `linkId` that matches the `linkId` of the questionnaire item they correspond to.
// 5. Response items will also always have an `id` that is unique within the response, which can be used to track changes to individual items.
// 6. Pagination is enabled by default, so current state items will only include items for the current page.
// 7. If Pagination is disabled, all items will be included in the current state items.

export interface UseQuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly defaultValue?: QuestionnaireResponse | Reference<QuestionnaireResponse>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly source?: QuestionnaireResponse['source'];
  readonly disablePagination?: boolean;
  readonly onChange?: (response: QuestionnaireResponse) => void;
}

export interface QuestionnaireFormPage {
  readonly linkId: string;
  readonly title: string;
  readonly group: QuestionnaireItem & { type: 'group' };
}

export interface QuestionnaireFormLoadingState {
  /** Currently loading data such as the Questionnaire or the QuestionnaireResponse default value */
  readonly loading: true;
}

export interface QuestionnaireFormLoadedState {
  /** Not loading */
  readonly loading: false;

  /** The loaded questionnaire */
  questionnaire: Questionnaire;

  /** The current draft questionnaire response */
  questionnaireResponse: QuestionnaireResponse;

  /** Optional questionnaire subject */
  subject?: Reference;

  /** Optional questionnaire encounter */
  encounter?: Reference<Encounter>;

  /** The top level items for the current page */
  items: QuestionnaireItem[];

  /** The response items for the current page */
  responseItems: QuestionnaireResponseItem[];

  /**
   * Adds a new group item to the current context.
   * @param context - The current context of the questionnaire response items.
   * @param item - The questionnaire item that is being added to the group.
   */
  onAddGroup: (context: QuestionnaireResponseItem[], item: QuestionnaireItem) => void;

  /**
   * Adds an answer to a repeating item.
   * @param context - The current context of the questionnaire response items.
   * @param item - The questionnaire item that is being answered.
   */
  onAddAnswer: (context: QuestionnaireResponseItem[], item: QuestionnaireItem) => void;

  /**
   * Changes an answer value.
   * @param context - The current context of the questionnaire response items.
   * @param item - The questionnaire item that is being answered.
   * @param answer - The answer(s) provided by the user for the questionnaire item.
   */
  onChangeAnswer: (
    context: QuestionnaireResponseItem[],
    item: QuestionnaireItem,
    answer: QuestionnaireResponseItemAnswer[]
  ) => void;

  /**
   * Sets or updates the signature for the questionnaire response.
   * @param signature - The signature to set, or undefined to clear the signature.
   */
  onChangeSignature: (signature: Signature | undefined) => void;
}

export interface QuestionnaireFormSinglePageState extends QuestionnaireFormLoadedState {
  readonly pagination: false;
}

export interface QuestionnaireFormPaginationState extends QuestionnaireFormLoadedState {
  readonly pagination: true;
  pages: QuestionnaireFormPage[];
  activePage: number;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export type QuestionnaireFormState =
  | QuestionnaireFormLoadingState
  | QuestionnaireFormSinglePageState
  | QuestionnaireFormPaginationState;

export function useQuestionnaireForm(props: UseQuestionnaireFormProps): Readonly<QuestionnaireFormState> {
  const questionnaire = useResource(props.questionnaire);
  const defaultResponse = useResource(props.defaultValue);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const state = useRef<Partial<QuestionnaireFormPaginationState>>({
    activePage: 0,
  });

  // If the questionnaire is loaded, we will set the current questionnaire and pages.
  if (!state.current.questionnaire && questionnaire) {
    state.current.questionnaire = questionnaire;
    state.current.pages = props.disablePagination ? undefined : getPages(questionnaire);
  }

  // If we are expecting a questionnaire response, and it is loaded, then use it.
  if (questionnaire && props.defaultValue && defaultResponse && !state.current.questionnaireResponse) {
    state.current.questionnaireResponse = buildInitialResponse(questionnaire, defaultResponse);
    emitChange();
  }

  // If we are not expecting a questionnaire response, we will create a new one.
  if (questionnaire && !props.defaultValue && !state.current.questionnaireResponse) {
    state.current.questionnaireResponse = buildInitialResponse(questionnaire);
    emitChange();
  }

  if (!state.current.questionnaire || !state.current.questionnaireResponse) {
    return { loading: true };
  }

  function getResponseItemByContext(
    context: QuestionnaireResponseItem[]
  ): QuestionnaireResponse | QuestionnaireResponseItem | undefined;
  function getResponseItemByContext(
    context: QuestionnaireResponseItem[],
    item?: QuestionnaireItem
  ): QuestionnaireResponseItem | undefined;
  function getResponseItemByContext(
    context: QuestionnaireResponseItem[],
    item?: QuestionnaireItem
  ): QuestionnaireResponse | QuestionnaireResponseItem | undefined {
    let currentItem: QuestionnaireResponse | QuestionnaireResponseItem | undefined =
      state.current.questionnaireResponse;
    for (const contextElement of context) {
      currentItem = currentItem?.item?.find((i) => i.linkId === contextElement.linkId);
    }
    if (item) {
      currentItem = currentItem?.item?.find((i) => i.linkId === item.linkId);
    }
    return currentItem;
  }

  function onNextPage(): void {
    state.current.activePage = (state.current.activePage ?? 0) + 1;
    forceUpdate();
  }

  function onPrevPage(): void {
    state.current.activePage = (state.current.activePage ?? 0) - 1;
    forceUpdate();
  }

  function onAddGroup(context: QuestionnaireResponseItem[], item: QuestionnaireItem): void {
    const responseItem = getResponseItemByContext(context);
    if (responseItem) {
      responseItem.item ??= [];
      responseItem.item.push(buildInitialResponseItem(item));
      emitChange();
    }
  }

  function onAddAnswer(context: QuestionnaireResponseItem[], item: QuestionnaireItem): void {
    const currentItem = getResponseItemByContext(context, item);
    if (currentItem) {
      currentItem.answer ??= [];
      currentItem.answer.push({});
      emitChange();
    }
  }

  function onChangeAnswer(
    context: QuestionnaireResponseItem[],
    item: QuestionnaireItem,
    answer: QuestionnaireResponseItemAnswer[]
  ): void {
    const currentItem = getResponseItemByContext(context, item);
    if (currentItem) {
      currentItem.answer = answer;
      emitChange();
    }
  }

  function onChangeSignature(signature: Signature | undefined): void {
    const currentResponse = state.current.questionnaireResponse;
    if (!currentResponse) {
      return;
    }
    if (signature) {
      currentResponse.extension = currentResponse.extension ?? [];
      currentResponse.extension = currentResponse.extension.filter(
        (ext) => ext.url !== QUESTIONNAIRE_SIGNATURE_RESPONSE_URL
      );
      currentResponse.extension.push({
        url: QUESTIONNAIRE_SIGNATURE_RESPONSE_URL,
        valueSignature: signature,
      });
    } else {
      currentResponse.extension = currentResponse.extension?.filter(
        (ext) => ext.url !== QUESTIONNAIRE_SIGNATURE_RESPONSE_URL
      );
    }
    emitChange();
  }

  function updateCalculatedExpressions(): void {
    const questionnaire = state.current.questionnaire;
    if (questionnaire?.item) {
      const response = state.current.questionnaireResponse as QuestionnaireResponse;
      evaluateCalculatedExpressionsInQuestionnaire(questionnaire.item, response);
    }
  }

  function emitChange(): void {
    const currentResponse = state.current.questionnaireResponse;
    if (!currentResponse) {
      return;
    }
    updateCalculatedExpressions();
    forceUpdate();
    props.onChange?.(currentResponse);
  }

  return {
    loading: false,
    pagination: !!state.current.pages,
    questionnaire: state.current.questionnaire,
    questionnaireResponse: state.current.questionnaireResponse,
    subject: props.subject,
    encounter: props.encounter,
    activePage: state.current.activePage,
    pages: state.current.pages,
    items: getItemsForPage(state.current.questionnaire, state.current.pages, state.current.activePage),
    responseItems: getResponseItemsForPage(
      state.current.questionnaireResponse,
      state.current.pages,
      state.current.activePage
    ),
    onNextPage,
    onPrevPage,
    onAddGroup,
    onAddAnswer,
    onChangeAnswer,
    onChangeSignature,
  } as QuestionnaireFormSinglePageState | QuestionnaireFormPaginationState;
}

function getPages(questionnaire: Questionnaire): QuestionnaireFormPage[] | undefined {
  if (!questionnaire?.item) {
    return undefined;
  }
  const extension = getExtension(questionnaire?.item?.[0], QUESTIONNAIRE_ITEM_CONTROL_URL);
  if (extension?.valueCodeableConcept?.coding?.[0]?.code !== 'page') {
    return undefined;
  }

  return questionnaire.item.map((item, index) => {
    return {
      linkId: item.linkId,
      title: item.text ?? `Page ${index + 1}`,
      group: item as QuestionnaireItem & { type: 'group' },
    };
  });
}

function getItemsForPage(
  questionnaire: Questionnaire,
  pages: QuestionnaireFormPage[] | undefined,
  activePage = 0
): QuestionnaireItem[] {
  if (pages && questionnaire?.item?.[activePage]) {
    return [questionnaire.item[activePage]];
  }
  return questionnaire.item ?? [];
}

function getResponseItemsForPage(
  questionnaireResponse: QuestionnaireResponse,
  pages: QuestionnaireFormPage[] | undefined,
  activePage = 0
): QuestionnaireResponseItem[] {
  if (pages && questionnaireResponse?.item?.[activePage]) {
    return [questionnaireResponse.item[activePage]];
  }
  return questionnaireResponse.item ?? [];
}

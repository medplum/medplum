import { useForm } from '@mantine/form';
import { GetInputPropsOptions, GetInputPropsReturnType, OnSubmit } from '@mantine/form/lib/types';
import { createReference, evalFhirPathTyped, isResource } from '@medplum/core';
import {
  Attachment,
  Coding,
  Encounter,
  Quantity,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemInitialValue,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  QuestionnaireResponseItemAnswerValue,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { createContext, useCallback, useEffect, useState } from 'react';
import { forEachItem } from './forEachItem';

interface QuestionnaireFormValues {
  [linkId: string]: QuestionnaireFormItem | QuestionnaireFormItem[];
}

interface QuestionnaireFormItem {
  answer?: QuestionnaireResponseItemAnswerValue;
  subItemAnswers?: QuestionnaireFormValues;
}

// Hooks Input / Return
interface UseQuestionnaireFormInput {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  initialResponse?: QuestionnaireResponse;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
}

type QuestionnaireFormValuesTransformer = (values: QuestionnaireFormValues) => QuestionnaireResponse;

export interface UseQuestionnaireFormReturn {
  schemaLoaded: boolean;
  questionnaire: Questionnaire | undefined;
  setValuesFromResponse: (response: QuestionnaireResponse) => void;
  setItemValue: (
    path: string,
    value: QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[] | undefined
  ) => void;
  getItemValue: (
    path: string
  ) => QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[] | undefined;
  addRepeatedAnswer: (path: string) => void;
  removeRepeatedAnswer: (path: string, index: number) => void;
  reorderRepeatedAnswer: (path: string, from: number, to: number) => void;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  forEachAnswer: <T>(callback: ForEachAnswerCallback<T>) => T[];
  onSubmit: OnSubmit<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>;
}

export function useQuestionnaireForm({
  initialResponse,
  ...props
}: UseQuestionnaireFormInput): UseQuestionnaireFormReturn {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const questionnaire = useResource(props.questionnaire);

  // const [activePage, setActivePage] = useState(0);

  // Load QuestionnaireSchema
  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  // Initialize Form hook
  const form = useForm<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>({
    mode: 'controlled',
    initialValues: {
      ...(initialResponse ? getValuesFromResponse(initialResponse) : {}),
    },
    validate: (values: QuestionnaireFormValues) => validate(values, questionnaire?.item ?? []),
    transformValues: (values: QuestionnaireFormValues) =>
      questionnaire
        ? createQuestionnaireResponse(values, questionnaire, {
            source: source && createReference(source),
            status: 'completed',
          })
        : { resourceType: 'QuestionnaireResponse', status: 'in-progress' },
  });

  // Set initial values
  useEffect(() => {
    if (questionnaire) {
      const initialValues = {
        ...getInitialValues(questionnaire),
        ...(initialResponse ? getValuesFromResponse(initialResponse) : {}),
      };
      form.initialize(initialValues);
    }
  }, [questionnaire, form, initialResponse]);

  // Set Values from QuestionnaireResponse
  const setValuesFromResponse = useCallback(
    (response: QuestionnaireResponse) => {
      const values = getValuesFromResponse(response.item);
      form.setValues(values);
    },
    [form]
  );

  // Input Element props
  const getInputProps = useCallback(
    (path: string, options: any) => {
      return form.getInputProps(linkIdToInternalPath(path), options);
    },
    [form]
  );

  // Form value traversal
  const forEachAnswerCallback = useCallback(
    <T>(callback: ForEachAnswerCallback<T>): T[] => {
      return forEachAnswerImpl(questionnaire, form.values, callback, getInputProps);
    },
    [questionnaire, form, getInputProps]
  );

  // Handle repeatable questions
  const addRepeatedAnswer = useCallback(
    (linkId: string) => {
      form.insertListItem(linkId, undefined);
    },
    [form]
  );

  const removeRepeatedAnswer = useCallback(
    (linkId: string, index: number) => {
      form.removeListItem(linkId, index);
    },
    [form]
  );

  const reorderRepeatedAnswer = useCallback(
    (linkId: string, from: number, to: number) => {
      form.reorderListItem(linkId, { from, to });
    },
    [form]
  );

  const setItemValue = useCallback(
    (
      path: string,
      value: QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[] | undefined
    ): void => {
      const internalPath = linkIdToInternalPath(path);
      console.debug(path, internalPath);
      const questionnaireItem = questionnaire && findQuestionnaireItem(questionnaire, path);

      if (!questionnaireItem) {
        console.error(`No questionnaire item found for path: ${path}`);
        return;
      }

      const isRepeating = questionnaireItem.repeats === true;

      if (isRepeating) {
        // Handle repeating items
        if (Array.isArray(value)) {
          // Set multiple values for a repeating item
          form.setFieldValue(
            internalPath,
            value.map((v) => ({ answer: v, subItemAnswers: undefined }))
          );
        } else if (value === undefined) {
          // Clear all values for a repeating item
          form.setFieldValue(internalPath, []);
        } else {
          // Set a single value for a repeating item (replacing existing values)
          form.setFieldValue(internalPath, [{ answer: value, subItemAnswers: undefined }]);
        }
      }
      // Handle non-repeating items
      else if (Array.isArray(value)) {
        // If a non-repeating item receives an array, use the first value
        form.setFieldValue(internalPath, { answer: value[0], subItemAnswers: {} });
      } else {
        form.setFieldValue(internalPath, { answer: value, subItemAnswers: {} });
      }
    },
    [questionnaire, form]
  );

  const getItemValue = useCallback(
    (path: string): QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[] | undefined => {
      const formItem = getFormItemByPath(form.values, linkIdToInternalPath(path));

      if (Array.isArray(formItem)) {
        return formItem.map((e) => e.answer) as QuestionnaireResponseItemAnswerValue[];
      }
      return formItem?.answer;
    },
    [form]
  );

  return {
    questionnaire,
    schemaLoaded,
    setValuesFromResponse,
    setItemValue,
    getItemValue,
    addRepeatedAnswer,
    removeRepeatedAnswer,
    reorderRepeatedAnswer,
    subject: props.subject,
    encounter: props.encounter,
    onSubmit: form.onSubmit,
    forEachAnswer: forEachAnswerCallback,
  };
}

// Get Input Props
export interface GetQuestionnaireItemInputReturnType extends GetInputPropsReturnType {
  key?: string;
}

export interface GetQuestionnaireItemInputPropsOptions extends GetInputPropsOptions {
  index?: number;
}

export type GetQuestionnaireItemInputPropsFunction = (
  item: QuestionnaireItem,
  options?: GetQuestionnaireItemInputPropsOptions
) => GetQuestionnaireItemInputReturnType;

type Validator = (value: any, values: QuestionnaireFormValues) => React.ReactNode;
function getItemValidator(item: QuestionnaireItem): Validator {
  return (value: any, _values: QuestionnaireFormValues): React.ReactNode => {
    if (item.required && !value) {
      return 'This field is required';
    }
    // Add more SDC-specific validation logic here
    return null;
  };
}

const validate = (values: Record<string, any>, items: QuestionnaireItem[]): Record<string, string> => {
  const validationErrors: Record<string, string> = {};
  items.forEach((item) => {
    const validator = getItemValidator(item);
    const error = validator(values[item.linkId], values);
    if (error) {
      validationErrors[item.linkId] = error as string;
    }
    if (item.type === 'group' && item.item) {
      const groupErrors = validate(values[item.linkId], item.item);
      if (Object.keys(groupErrors).length > 0) {
        validationErrors[item.linkId] = 'This group contains errors';
      }
    }
  });
  return validationErrors;
};

function createQuestionnaireResponse(
  formValues: Readonly<QuestionnaireFormValues>,
  questionnaire: Readonly<Questionnaire>,
  partial: Readonly<Partial<QuestionnaireResponse>> = {}
): QuestionnaireResponse {
  console.debug('createQuestionnaireResponse');
  const response: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    ...partial,
    item: createResponseItems(formValues, questionnaire),
  };

  return response;
}

function createResponseItems(
  formValues: Readonly<QuestionnaireFormValues>,
  questionnaire: Readonly<Questionnaire>
): QuestionnaireResponseItem[] {
  return forEachAnswerImpl(
    questionnaire,
    formValues,
    (
      questionnaireItem: QuestionnaireItem,
      answer: CallbackAnswers<QuestionnaireResponseItem[]> | undefined
    ): QuestionnaireResponseItem[] => {
      const answers: ForEachAnswerCallbackValue<QuestionnaireResponseItem[]>[] = [];
      if (Array.isArray(answer)) {
        answers.push(...answer);
      } else if (answer) {
        answers.push(answer);
      }

      console.debug('createResponseItems', answer);

      // how many results with there be? only 1, unless it's a repeated group.
      const result: QuestionnaireResponseItem[] = [];
      if (questionnaireItem.type === 'group') {
        answers.forEach((answer) => {
          result.push({
            linkId: questionnaireItem.linkId,
            answer: undefined,
            item: answer.subItemResults && Object.values(answer.subItemResults).flat(),
          });
        });
      } else {
        result.push({
          linkId: questionnaireItem.linkId,
          answer: answers.map((answer) => ({
            ...createAnswer(questionnaireItem, answer.answer),
            item: answer.subItemResults && Object.values(answer.subItemResults).flat(),
          })),
          item: undefined,
        });
      }
      return result;
    }
  ).flat();
}

function createAnswer(
  item: QuestionnaireItem,
  answer: QuestionnaireResponseItemAnswerValue | undefined
): QuestionnaireResponseItemAnswer | undefined {
  switch (item.type) {
    case 'string':
    case 'text':
      return { valueString: answer as string };

    case 'boolean':
      return {
        valueBoolean: answer as boolean,
      };

    case 'decimal':
      return {
        valueDecimal: answer as number,
      };

    case 'integer':
      return {
        valueInteger: answer as number,
      };

    case 'date':
      return {
        valueDate: answer as string,
      }; // Dates should be in ISO format

    case 'dateTime':
      return {
        valueDateTime: answer as string,
      }; // DateTimes should be in ISO format

    case 'time':
      return {
        valueTime: answer as string,
      };

    case 'url':
      return {
        valueUri: answer as string,
      };

    case 'reference':
      return {
        valueReference: answer as Reference,
      };

    case 'attachment':
      return {
        valueAttachment: answer as Attachment,
      }; // Assume value is of type Attachment

    case 'quantity':
      return {
        valueQuantity: answer as Quantity,
      }; // Assume value is of type Quantity

    case 'display':
    case 'question':
    case 'group':
      return undefined;
    case 'choice':
    case 'open-choice':
      if (item.answerValueSet) {
        return {
          valueCoding: answer as Coding,
        };
      } else {
        return {
          valueString: answer as string,
        };
      }
    default:
      return undefined;
  }
}

function extractAnswerValue(answer: QuestionnaireResponseItemAnswer): QuestionnaireResponseItemAnswerValue | undefined {
  return evalFhirPathTyped('value', [{ value: answer, type: 'QuestionnaireResponseItemAnswer' }])?.[0].value;
}

/* -- Initial Values --*/

function getInitialValuesForItem(root: QuestionnaireItem): QuestionnaireFormValues {
  const result = forEachItem(
    root,
    (
      curItem,
      childResults: Record<string, QuestionnaireFormItem | QuestionnaireFormItem[]> | undefined
    ): QuestionnaireFormItem | QuestionnaireFormItem[] => {
      let initialValues = evalFhirPathTyped('initial.value', [{ type: 'QuestionnaireItem', value: curItem }]).map(
        (v) => v.value as QuestionnaireItemInitialValue | undefined
      );

      if (curItem.repeats) {
        if (initialValues.length === 0 && childResults) {
          initialValues = [undefined];
        }
        return initialValues.map((value) => ({
          answer: value,
          subItemAnswers: { ...childResults },
        }));
      } else {
        return {
          answer: initialValues[0],
          subItemAnswers: { ...childResults },
        };
      }
    }
  );

  return { [root.linkId]: result };
}

const getInitialValues = (questionnaire: Questionnaire): QuestionnaireFormValues => {
  return questionnaire.item?.reduce((acc, item) => ({ ...acc, ...getInitialValuesForItem(item) }), {}) ?? {};
};

function getValuesFromResponse(
  responses: QuestionnaireResponse | QuestionnaireResponseItem[] | undefined
): QuestionnaireFormValues {
  if (!responses) {
    return {};
  }
  const rootItems = isResource(responses) ? responses.item ?? [] : responses;

  const processResponseItem = (
    item: QuestionnaireResponseItem,
    childResults: Record<string, QuestionnaireFormItem | QuestionnaireFormItem[]> | undefined
  ): QuestionnaireFormItem | QuestionnaireFormItem[] => {
    const isRepeating = item.answer && item.answer.length > 1;

    if (isRepeating) {
      return (
        item.answer?.map((answer) => ({
          answer: extractAnswerValue(answer),
          items: childResults,
        })) ?? []
      );
    } else {
      return {
        answer: item.answer ? extractAnswerValue(item.answer?.[0]) : undefined,
        subItemAnswers: childResults,
      };
    }
  };

  const result = rootItems.reduce((acc: QuestionnaireFormValues, item) => {
    const result = forEachItem(item, processResponseItem);
    acc[item.linkId] = result;
    return acc;
  }, {});

  return result;
}

/* -- Traversal --*/
/**
 * Converts a link ID path with dot notation to an internal path for QuestionnaireFormValues.
 * @param linkIdPath - The link ID path with dot notation
 * @returns The converted internal path
 */
function linkIdToInternalPath(linkIdPath: string): string {
  const parts = splitLinkIdPath(linkIdPath);
  const result: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    result.push(parts[i]);

    if (i < parts.length - 1 && isNaN(Number(parts[i + 1]))) {
      // If the next part is not a number (i.e., not an index for a repeated item),
      // add 'subItemAnswers'
      result.push('subItemAnswers');
    }
  }

  return result.join('.');
}

function splitLinkIdPath(linkIdPath: string): string[] {
  const regex = /(?<!\\)\./g;
  const parts = linkIdPath.split(regex);
  return parts.map((part) => encodeLink(part.replace(/\\\./g, '.')));
}

function encodeLink(part: string): string {
  return part.replace(/\./g, '%2E');
}

function decodeLink(part: string): string {
  return part.replace(/%2E/g, '.');
}

// /**
//  * Converts an internal path for QuestionnaireFormValues back to a link ID path with dot notation.
//  * @param internalPath - The internal path
//  * @returns The converted link ID path
//  */
// function internalToLinkIdPath(internalPath: string): string {
//   const parts = internalPath.split('.');
//   const result: string[] = [];

//   for (const part of parts) {
//     if (part === 'subItemAnswers') {
//       // Skip 'items'
//       continue;
//     }

//     result.push(part);
//   }

//   return result.join('.');
// }

interface ForEachAnswerCallbackValue<T> {
  answer?: QuestionnaireResponseItemAnswerValue;
  subItemResults?: Record<string, T>;
}

type CallbackAnswers<T> = ForEachAnswerCallbackValue<T> | ForEachAnswerCallbackValue<T>[];

type ForEachAnswerCallback<T> = (
  questionnaireItem: QuestionnaireItem,
  answers: CallbackAnswers<T> | undefined,
  state: {
    resource: Questionnaire;
    path: string;
    inputProps?: any;
  }
) => T;

function forEachAnswerImpl<T>(
  questionnaire: Questionnaire | undefined,
  formValues: QuestionnaireFormValues,
  callback: ForEachAnswerCallback<T>,
  getInputProps?: (path: string, options?: any) => any
): T[] {
  if (!questionnaire) {
    return [];
  }
  // Recursively traverse the current answers
  function traverse(
    item: QuestionnaireItem,
    formItem: QuestionnaireFormItem | QuestionnaireFormItem[],
    path: string
  ): T {
    if (Array.isArray(formItem)) {
      // Handle repeating items
      const callbackValues: ForEachAnswerCallbackValue<T>[] = formItem.map((subItem, index) => {
        const repeatingPath = `${path}.${index}`;
        const subItemResults = traverseSubItems(item, subItem, repeatingPath);
        return {
          answer: subItem.answer,
          subItemResults,
        };
      });

      return callback(item, callbackValues, {
        resource: questionnaire as Questionnaire,
        path,
        inputProps: getInputProps?.(path),
      });
    } else {
      // Handle non-repeating items
      const subItemResults = traverseSubItems(item, formItem, path);
      const callbackValue: ForEachAnswerCallbackValue<T> = {
        answer: formItem.answer,
        subItemResults,
      };

      return callback(item, callbackValue, {
        resource: questionnaire as Questionnaire,
        path,
        inputProps: getInputProps?.(path),
      });
    }
  }

  function traverseSubItems(item: QuestionnaireItem, formItem: QuestionnaireFormItem, path: string): Record<string, T> {
    const subItemResults: Record<string, T> = {};

    if (item.item && formItem.subItemAnswers) {
      for (const subItem of item.item) {
        const subPath = `${path}.subItemAnswers.${subItem.linkId}`;
        const subFormItem = formItem.subItemAnswers[subItem.linkId];

        if (subFormItem) {
          subItemResults[subItem.linkId] = traverse(subItem, subFormItem, subPath);
        }
      }
    }

    return subItemResults;
  }

  // Process top-level questionnaire items and collect their results
  return (
    questionnaire.item
      ?.map((item) => {
        const formItem = formValues[item.linkId];
        return formItem ? traverse(item, formItem, item.linkId) : undefined;
      })
      .filter((result): result is T => result !== undefined) ?? []
  );
}

// function isQuestion(item: QuestionnaireItem): boolean {
//   return item.type !== 'group' && item.type !== 'display';
// }

function findQuestionnaireItem(questionnaire: Questionnaire, path: string): QuestionnaireItem | undefined {
  const parts = splitLinkIdPath(path);
  let currentItems: QuestionnaireItem[] | undefined = questionnaire.item;

  for (const part of parts) {
    const decodedPart = decodeLink(part);
    console.log(decodedPart);
    if (!currentItems) {
      return undefined;
    }

    const item = currentItems.find((i) => i.linkId === decodedPart);
    if (!item) {
      return undefined;
    }

    if (part === parts[parts.length - 1]) {
      return item;
    }

    currentItems = item.item;
  }

  return undefined;
}

function getFormItemByPath(
  formValues: QuestionnaireFormValues,
  path: string
): QuestionnaireFormItem | QuestionnaireFormItem[] | undefined {
  const parts = path.split('.');
  let current: any = formValues;

  for (const part of parts) {
    const decodedPart = decodeLink(part);
    console.debug('decoded part', part, decodedPart, current);
    if (current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = parseInt(decodedPart, 10);
      if (isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (decodedPart === 'subItemAnswers' && current.subItemAnswers) {
        current = current.subItemAnswers;
      } else if (current[decodedPart] !== undefined) {
        current = current[decodedPart];
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  if (isQuestionnaireFormItem(current) || Array.isArray(current)) {
    return current;
  }

  return undefined;
}

function isQuestionnaireFormItem(item: any): item is QuestionnaireFormItem {
  return item && typeof item === 'object' && ('answer' in item || 'subItemAnswers' in item);
}

export const QuestionnaireFormContext = createContext<UseQuestionnaireFormReturn | null>(null);

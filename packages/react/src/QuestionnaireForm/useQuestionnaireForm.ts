import { useForm, UseFormReturnType } from '@mantine/form';
import { GetInputPropsOptions, GetInputPropsReturnType } from '@mantine/form/lib/types';
import { createReference, evalFhirPathTyped, isResource } from '@medplum/core';
import {
  Attachment,
  Coding,
  Quantity,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  QuestionnaireResponseItemAnswerValue,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { createContext, useCallback, useEffect, useState } from 'react';

export type GetQuestionnaireItemInputPropsFunction = (
  item: QuestionnaireItem,
  options?: GetInputPropsOptions
) => GetInputPropsReturnType;

type QuestionnaireFormValues = Record<string, QuestionnaireResponseItemAnswerValue>;
type QuestionnaireFormValuesTransformer = (values: QuestionnaireFormValues) => QuestionnaireResponse;

interface UseQuestionnaireFormReturn
  extends Omit<UseFormReturnType<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>, 'getInputProps'> {
  schemaLoaded: boolean;
  questionnaire: Questionnaire | undefined;
  getInputProps: GetQuestionnaireItemInputPropsFunction;
  setValuesFromResponse: (response: QuestionnaireResponse) => void;
}

interface UseQuestionnaireFormInput {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  initialResponse?: QuestionnaireResponse;
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

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum]);

  const form = useForm<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>({
    mode: 'controlled',
    initialValues: {
      ...(initialResponse ? getValuesFromResponse(initialResponse) : {}),
    },
    validate: (values: QuestionnaireFormValues) => validate(values, questionnaire?.item ?? []),
    transformValues: (values: QuestionnaireFormValues) =>
      createQuestionnaireResponse(values, questionnaire, {
        source: source && createReference(source),
        status: 'completed',
      }),
  });

  useEffect(() => {
    if (questionnaire) {
      const initialValues = {
        ...getInitialValues(questionnaire),
        ...(initialResponse ? getValuesFromResponse(initialResponse) : {}),
      };
      form.initialize(initialValues);
    }
  }, [questionnaire, form, initialResponse]);

  const setValuesFromResponse = useCallback(
    (response: QuestionnaireResponse) => {
      const values = getValuesFromResponse(response.item);
      form.setValues(values);
    },
    [form]
  );

  function getInputProps(item: QuestionnaireItem, options?: GetInputPropsOptions): GetInputPropsReturnType {
    const fieldName = item.linkId;
    return form.getInputProps(fieldName, options);
  }

  return {
    ...form,
    questionnaire,
    schemaLoaded,
    getInputProps,
    setValuesFromResponse,
  };
}

export const QuestionnaireFormContext = createContext<UseQuestionnaireFormReturn | null>(null);

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

export function createQuestionnaireResponse(
  values: Record<string, any>,
  questionnaire: Questionnaire | undefined,
  response?: Partial<QuestionnaireResponse>
): QuestionnaireResponse {
  if (!questionnaire) {
    throw new Error('Questionnaire is undefined');
  }

  const responseItems = forEachItem<QuestionnaireResponseItem, Questionnaire>(
    questionnaire,
    (item, _ancestors, _rootResource, childrenResults) => {
      const responseItem: QuestionnaireResponseItem = {
        linkId: item.linkId,
        item: childrenResults.length > 0 ? childrenResults : undefined,
      };

      if (values[item.linkId] !== undefined) {
        responseItem.answer = [createAnswer(item, values[item.linkId])];
      }

      return responseItem;
    },
    values
  );

  return {
    resourceType: 'QuestionnaireResponse',
    item: responseItems,
    status: response?.status ?? 'completed',
    ...response,
  };
}

function createAnswer(item: QuestionnaireItem, value: any): QuestionnaireResponseItemAnswer {
  const answer: QuestionnaireResponseItemAnswer = {};

  switch (item.type) {
    case 'string':
    case 'text':
      answer.valueString = value as string;
      break;
    case 'boolean':
      answer.valueBoolean = value as boolean;
      break;
    case 'decimal':
      answer.valueDecimal = value as number;
      break;
    case 'integer':
      answer.valueInteger = value as number;
      break;
    case 'date':
      answer.valueDate = value as string; // Dates should be in ISO format
      break;
    case 'dateTime':
      answer.valueDateTime = value as string; // DateTimes should be in ISO format
      break;
    case 'time':
      answer.valueTime = value as string;
      break;
    case 'url':
      answer.valueUri = value as string;
      break;
    case 'reference':
      answer.valueReference = value as Reference;
      break;
    case 'attachment':
      answer.valueAttachment = value as Attachment; // Assume value is of type Attachment
      break;
    case 'quantity':
      answer.valueQuantity = value as Quantity; // Assume value is of type Quantity
      break;
    case 'display':
    case 'question':
    case 'group':
      break;
    case 'choice':
    case 'open-choice':
      if (item.answerValueSet) {
        answer.valueCoding = value as Coding;
      } else {
        answer.valueString = value as string;
      }

      break;
  }

  return answer;
}

const getInitialValues = (questionnaire: Questionnaire): Record<string, any> => {
  const initialValues: Record<string, any> = {};

  forEachItem(questionnaire, (currentItem) => {
    if (currentItem.type !== 'group' && currentItem.type !== 'display') {
      initialValues[currentItem.linkId] = evalFhirPathTyped('initial.value', [
        { type: 'QuestionnaireItem', value: currentItem },
      ]);
    }
    return null;
  });

  return initialValues;
};

function getValuesFromResponse(
  responses: QuestionnaireResponse | QuestionnaireResponseItem[] | undefined
): Record<string, any> {
  const values: Record<string, string> = {};
  const items = isResource(responses) ? responses.item : responses;
  items?.forEach((item) => {
    if (item.answer) {
      values[item.linkId] = item.answer[0].valueString ?? '';
    }
    if (item.item) {
      Object.assign(values, getValuesFromResponse(item.item));
    }
  });
  return values;
}

type QuestionnaireItemType<R> = R extends Questionnaire ? QuestionnaireItem : QuestionnaireResponseItem;
type QuestionnaireItemsType<R> = R extends Questionnaire ? QuestionnaireItem[] : QuestionnaireResponseItem[];

type QuestionnaireIteratorCallback<T, R extends Questionnaire | QuestionnaireResponse> = (
  currentItem: QuestionnaireItemType<R>,
  ancestors: QuestionnaireItemType<R>[],
  rootResource: R,
  childrenResults: T[],
  currentValues?: Record<string, QuestionnaireResponseItemAnswerValue>
) => T;

export function forEachItem<T, R extends Questionnaire | QuestionnaireResponse>(
  resource: R,
  callback: QuestionnaireIteratorCallback<T, R>,
  currentValues?: Readonly<Record<string, QuestionnaireResponseItemAnswerValue>>,
  items?: QuestionnaireItemsType<R>,
  ancestors: QuestionnaireItemType<R>[] = []
): T[] {
  const results: T[] = [];

  const rootItems = (isResource(resource) ? resource.item : items) ?? [];

  for (const item of rootItems) {
    const childrenResults: T[] = [];
    if (item.item) {
      childrenResults.push(
        ...forEachItem(resource, callback, currentValues, item.item as QuestionnaireItemsType<R>, [
          item as QuestionnaireItemType<R>,
          ...ancestors,
        ])
      );
    }
    const result = callback(item as QuestionnaireItemType<R>, ancestors, resource, childrenResults, currentValues);
    results.push(result);
  }

  return results;
}

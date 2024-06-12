import { useForm, UseFormReturnType } from '@mantine/form';
import { GetInputPropsOptions, GetInputPropsReturnType } from '@mantine/form/lib/types';
import { createReference, evalFhirPathTyped, isResource, ProfileResource } from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswerValue,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { ReactNode, useCallback, useEffect, useState } from 'react';

export interface GetQuestionnaireItemInputPropsReturnType extends GetInputPropsReturnType {
  error?: ReactNode | undefined;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
}

export type GetQuestionnaireItemInputPropsFunction = (
  item: QuestionnaireItem,
  options?: GetInputPropsOptions
) => GetQuestionnaireItemInputPropsReturnType;

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

  const validateForm = useCallback(
    (values: QuestionnaireFormValues) => validate(values, questionnaire?.item ?? []),
    [questionnaire]
  );
  const form = useForm<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>({
    initialValues: {},
    validate: validateForm,
    transformValues: (values) => createQuestionnaireResponse(values, questionnaire, source, 'completed'),
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

  function getInputProps(
    item: QuestionnaireItem,
    options?: GetInputPropsOptions
  ): GetQuestionnaireItemInputPropsReturnType {
    const fieldName = item.linkId;
    const { onChange: defaultOnChange, ...rest } = form.getInputProps(fieldName, options);
    return {
      ...rest,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        defaultOnChange(event);
      },
      onBlur: (_event: React.FocusEvent<HTMLInputElement>) => {
        console.log('Blur', fieldName);
      },
      onFocus: (_event: React.FocusEvent<HTMLInputElement>) => {
        console.log('Focus', fieldName);
      },
    };
  }

  return {
    ...form,
    questionnaire,
    schemaLoaded,
    getInputProps,
    setValuesFromResponse,
  };
}

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
  values: Record<string, any>,
  questionnaire: Questionnaire | undefined,
  source: ProfileResource | undefined,
  status: QuestionnaireResponse['status'] = 'completed'
): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status,
    source: source && createReference(source),
    item:
      questionnaire &&
      forEachItem(questionnaire, (item, _ancestors, _root, childAnswers) => ({
        linkId: item.linkId,
        answer: item.type === 'group' ? childAnswers : [{ valueString: values[item.linkId] }],
      })),
  };
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

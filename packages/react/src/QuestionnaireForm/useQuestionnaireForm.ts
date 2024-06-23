import { useForm, UseFormReturnType } from '@mantine/form';
import { GetInputPropsOptions, GetInputPropsReturnType } from '@mantine/form/lib/types';
import { createReference, evalFhirPathTyped, isResource } from '@medplum/core';
import {
  Attachment,
  Coding,
  Encounter,
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
import { forEachItem } from './forEachItem';

// Form values
type AnswerType = QuestionnaireResponseItemAnswerValue | QuestionnaireResponseItemAnswerValue[];
type QuestionnaireFormValues = Record<string, AnswerType>;

// Hooks Input / Return
interface UseQuestionnaireFormInput {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  initialResponse?: QuestionnaireResponse;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
}

type QuestionnaireFormValuesTransformer = (values: QuestionnaireFormValues) => QuestionnaireResponse;

export interface UseQuestionnaireFormReturn
  extends Omit<UseFormReturnType<QuestionnaireFormValues, QuestionnaireFormValuesTransformer>, 'getInputProps'> {
  schemaLoaded: boolean;
  questionnaire: Questionnaire | undefined;
  getInputProps: GetQuestionnaireItemInputPropsFunction;
  setValuesFromResponse: (response: QuestionnaireResponse) => void;
  addRepeatedAnswer: (linkId: string) => void;
  removeRepeatedAnswer: (linkId: string, index: number) => void;
  reorderRepeatableItem: (linkId: string, from: number, to: number) => void;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
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
      createQuestionnaireResponse(values, questionnaire, {
        source: source && createReference(source),
        status: 'completed',
      }),
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

  // Get Input Props
  function getInputProps(
    item: QuestionnaireItem,
    options?: GetQuestionnaireItemInputPropsOptions
  ): GetQuestionnaireItemInputReturnType {
    let fieldName = item.linkId;
    if (item.repeats) {
      if (options?.index === undefined) {
        throw new Error('Missing index for repeated field in getInputProps');
      }
      fieldName += `.${options.index}`;
    }
    return { ...form.getInputProps(fieldName, options), key: form.key(fieldName) };
  }

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

  const reorderRepeatableItem = useCallback(
    (linkId: string, from: number, to: number) => {
      form.reorderListItem(linkId, { from, to });
    },
    [form]
  );

  return {
    ...form,
    questionnaire,
    schemaLoaded,
    getInputProps,
    setValuesFromResponse,
    addRepeatedAnswer,
    removeRepeatedAnswer,
    reorderRepeatableItem,
    subject: props.subject,
    encounter: props.encounter,
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

export function createQuestionnaireResponse(
  values: Record<string, any>,
  questionnaire: Questionnaire | undefined,
  response?: Partial<QuestionnaireResponse>
): QuestionnaireResponse {
  if (!questionnaire) {
    throw new Error('Questionnaire is undefined');
  }

  const responseItems = forEachItem<QuestionnaireResponseItem, QuestionnaireItem>(
    questionnaire,
    (item, _state, childrenResults) => {
      const responseItem: QuestionnaireResponseItem = {
        linkId: item.linkId,
        item: childrenResults.length > 0 ? childrenResults : undefined,
      };

      if (values[item.linkId] !== undefined) {
        const currentValue = values[item.linkId];
        if (Array.isArray(currentValue)) {
          responseItem.answer = currentValue.map((val) => createAnswer(item, val));
        } else {
          responseItem.answer = [createAnswer(item, values[item.linkId])];
        }
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

const getInitialValues = (questionnaire: Questionnaire): QuestionnaireFormValues => {
  const initialValues: QuestionnaireFormValues = {};

  forEachItem(questionnaire, (currentItem): void => {
    if (currentItem.type !== 'group' && currentItem.type !== 'display') {
      const initialItemValue = evalFhirPathTyped('initial.value', [{ type: 'QuestionnaireItem', value: currentItem }]);
      if (!currentItem.repeats) {
        initialValues[currentItem.linkId] = initialItemValue.at(0)?.value || null;
      }
      {
        initialValues[currentItem.linkId] = initialItemValue.map((e) => e.value);
      }
    }
  });

  return initialValues;
};

function getValuesFromResponse(
  responses: QuestionnaireResponse | QuestionnaireResponseItem[] | undefined
): QuestionnaireFormValues {
  const values: QuestionnaireFormValues = {};
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

export const QuestionnaireFormContext = createContext<UseQuestionnaireFormReturn | null>(null);

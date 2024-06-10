import { useForm, UseFormReturnType } from '@mantine/form';
import { GetInputPropsOptions, GetInputPropsReturnType } from '@mantine/form/lib/types';
import { createReference, ProfileResource } from '@medplum/core';
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

export const getInitialValues = (items: QuestionnaireItem[]): Record<string, any> => {
  const initialValues: Record<string, any> = {};
  items.forEach((item) => {
    if (item.type === 'group' && item.item) {
      initialValues[item.linkId] = getInitialValues(item.item);
    } else {
      initialValues[item.linkId] = item.initial?.[0]?.valueString ?? '';
    }
  });
  return initialValues;
};

function getValuesFromResponse(responses: QuestionnaireResponseItem[] | undefined): Record<string, any> {
  const values: Record<string, string> = {};
  responses?.forEach((item) => {
    if (item.answer) {
      values[item.linkId] = item.answer[0].valueString ?? '';
    }
    if (item.item) {
      Object.assign(values, getValuesFromResponse(item.item));
    }
  });
  return values;
}

// type QuestionnaireAnswerTypes = Pick<
//   {
//     string: string;
//     quantity: Quantity;
//     choice: string;
//     'open-choice': string;
//     group: never;
//     display: never;
//     boolean: boolean;
//     reference: Reference;
//     question: never;
//     decimal: number;
//     integer: number;
//     date: string;
//     dateTime: string;
//     time: string;
//     text: string;
//     url: string;
//     attachment: Attachment;
//   },
//   QuestionnaireItem['type']
// >;

export interface QuestionnaireItemInputProps extends GetInputPropsReturnType {
  error?: ReactNode | undefined;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
}

export type GetQuestionnaireItemInputProps = (
  item: QuestionnaireItem,
  options?: GetInputPropsOptions
) => QuestionnaireItemInputProps;

interface UseQuestionnaireFormReturn extends Omit<UseFormReturnType<QuestionnaireFormValues>, 'getInputProps'> {
  schemaLoaded: boolean;
  questionnaire: Questionnaire | undefined;
  handleChange: (name: string, value: QuestionnaireResponseItemAnswerValue) => void;
  handleSubmit: (
    onSubmit: (response: QuestionnaireResponse) => void
  ) => (event: React.FormEvent<HTMLFormElement>) => void;
  getInputProps: GetQuestionnaireItemInputProps;
  setValuesFromResponse: (response: QuestionnaireResponse) => void;
}

type QuestionnaireFormValues = Record<string, QuestionnaireResponseItemAnswerValue>;

export function useQuestionnaireForm(
  resource: Questionnaire | Reference<Questionnaire>,
  initialResponse?: QuestionnaireResponse
): UseQuestionnaireFormReturn {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const questionnaire = useResource(resource);
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
  const form = useForm<QuestionnaireFormValues>({
    initialValues: {},
    validate: validateForm,
  });

  useEffect(() => {
    if (questionnaire) {
      const initialValues = initialResponse
        ? getValuesFromResponse(initialResponse.item)
        : getInitialValues(questionnaire.item ?? []);
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

  const handleSubmit = useCallback(
    (onSubmit: (response: QuestionnaireResponse) => void) =>
      form.onSubmit((values) => {
        if (Object.keys(form.errors).length === 0) {
          const questionnaireResponse = createQuestionnaireResponse(values, questionnaire?.item ?? [], source);
          onSubmit(questionnaireResponse);
        }
      }),
    [form, questionnaire, source]
  );

  const handleChange = useCallback(
    (name: string, value: any) => {
      form.setFieldValue(name, value);
    },
    [form]
  );

  function getInputProps(item: QuestionnaireItem, options?: GetInputPropsOptions): QuestionnaireItemInputProps {
    const fieldName = item.linkId;
    return {
      ...form.getInputProps(fieldName, options),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        handleChange(fieldName, event.target.value);
      },
      onBlur: () => {
        console.log('Blur', fieldName);
      },
      onFocus: () => {
        console.log('Focus', fieldName);
      },
    };
  }

  return {
    ...form,
    questionnaire,
    schemaLoaded,
    handleChange,
    handleSubmit,
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
  items: QuestionnaireItem[],
  source: ProfileResource | undefined,
  status: QuestionnaireResponse['status'] = 'completed'
): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status,
    source: source && createReference(source),
    item: items.map((item) => ({
      linkId: item.linkId,
      answer:
        item.type === 'group' && item.item
          ? [{ item: createQuestionnaireResponse(values[item.linkId], item.item, source).item }]
          : [{ valueString: values[item.linkId] }],
    })),
  };
}

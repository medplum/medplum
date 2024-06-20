import { Button, Stack, Title, TitleOrder } from '@mantine/core';
import { Encounter, Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { ReactNode, useCallback } from 'react';
import { FormSection } from '../FormSection/FormSection';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/QuestionnaireFormItem';
import {
  QuestionnaireFormContext,
  QuestionnaireFormItemData,
  forEachItem,
  useQuestionnaireForm,
} from './useQuestionnaireForm';

export interface QuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly submitButtonText?: string;
  readonly initialResponse?: QuestionnaireResponse;
  readonly onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const form = useQuestionnaireForm(props);
  const questionnaire = form.questionnaire;

  const renderItem = useCallback(
    (
      item: QuestionnaireItem,
      { childrenResults, ancestors }: QuestionnaireFormItemData<QuestionnaireItem, ReactNode>
    ): ReactNode => {
      if (item.type === 'display') {
        return <p>{item.text}</p>;
      }

      let currentNode: ReactNode = undefined;

      if (item.type === 'group') {
        currentNode = (
          <Title order={(3 + ancestors.length) as TitleOrder} mb="md" key={item.linkId}>
            {item.text}
          </Title>
        );
      } else {
        currentNode = (
          <FormSection key={item.linkId} htmlFor={item.linkId} title={item.text} withAsterisk={item.required}>
            <QuestionnaireFormItem item={item} />
          </FormSection>
        );
      }

      return (
        <Stack key={item.linkId}>
          {currentNode}
          <Stack style={{ paddingLeft: `calc(${ancestors.length + 1} * 1rem)` }}>{childrenResults}</Stack>
        </Stack>
      );
    },
    []
  );

  if (!questionnaire || !form.schemaLoaded) {
    return null;
  }

  const title = questionnaire.title;

  return (
    <QuestionnaireFormContext.Provider value={form}>
      <form
        onSubmit={form.onSubmit((response) => {
          console.dir(response, { depth: null });
        })}
      >
        {title && <Title>{title}</Title>}
        {forEachItem(questionnaire, renderItem, form.values)}

        <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>
      </form>
    </QuestionnaireFormContext.Provider>
  );
}

import { Button, Group, Stack, Title } from '@mantine/core';
import { Encounter, Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { ReactNode } from 'react';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/QuestionnaireFormItem';
import { QuestionnaireItemState, forEachItem } from './forEachItem';
import { QuestionnaireFormContext, useQuestionnaireForm } from './useQuestionnaireForm';

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

  if (!questionnaire || !form.schemaLoaded) {
    return null;
  }

  const title = questionnaire.title;

  const elements = forEachItem(questionnaire, renderItem, form.values);
  console.debug(elements);

  return (
    <QuestionnaireFormContext.Provider value={form}>
      <form
        onSubmit={form.onSubmit((response) => {
          props.onSubmit(response);
        })}
      >
        {title && <Title>{title}</Title>}
        <Stack>{elements}</Stack>
        <Group justify="flex-end" mt="xl" gap="xs">
          <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>
        </Group>
      </form>
    </QuestionnaireFormContext.Provider>
  );
}

const renderItem = (
  item: QuestionnaireItem,
  state: QuestionnaireItemState<QuestionnaireItem>,
  children: ReactNode[]
): ReactNode => {
  return (
    <QuestionnaireFormItem key={item.linkId} item={item} itemState={state}>
      {children}
    </QuestionnaireFormItem>
  );
};

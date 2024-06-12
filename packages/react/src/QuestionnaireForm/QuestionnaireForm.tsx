import { Button, Stack } from '@mantine/core';
import { Encounter, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { QuestionnaireFormItem } from './QuestionnaireFormItem/QuestionnaireFormItem';
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
  if (!form.questionnaire || !form.schemaLoaded) {
    return null;
  }

  return (
    <QuestionnaireFormContext.Provider value={form}>
      <form
        onSubmit={form.onSubmit((response) => {
          console.dir(response, { depth: null });
        })}
      >
        <Stack>
          {form.questionnaire.item?.map((item, index) => (
            <QuestionnaireFormItem key={item.linkId + '.' + index} item={item} />
          ))}
        </Stack>
        <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>
      </form>
    </QuestionnaireFormContext.Provider>
  );
}

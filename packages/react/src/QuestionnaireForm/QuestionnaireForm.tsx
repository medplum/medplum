import { Group, Title } from '@mantine/core';
import { createReference, getReferenceString } from '@medplum/core';
import { Encounter, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useMedplum, useQuestionnaireForm } from '@medplum/react-hooks';
import { JSX, useCallback, useRef } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { QuestionnaireFormItemArray } from './QuestionnaireFormItemArray';
import { QuestionnaireFormStepper } from './QuestionnaireFormStepper';

export interface QuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly questionnaireResponse?: QuestionnaireResponse | Reference<QuestionnaireResponse>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly source?: QuestionnaireResponse['source'];
  readonly disablePagination?: boolean;
  readonly excludeButtons?: boolean;
  readonly submitButtonText?: string;
  readonly onChange?: (response: QuestionnaireResponse) => void;
  readonly onSubmit?: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();

  const propsRef = useRef(props);
  propsRef.current = props;

  const formState = useQuestionnaireForm({
    questionnaire: props.questionnaire,
    defaultValue: props.questionnaireResponse,
    subject: props.subject,
    encounter: props.encounter,
    source: props.source,
    disablePagination: props.disablePagination,
    onChange: props.onChange,
  });
  const formStateRef = useRef(formState);
  formStateRef.current = formState;

  const handleSubmit = useCallback(() => {
    const formState = formStateRef.current;
    if (formState.loading) {
      return;
    }

    const onSubmit = propsRef.current.onSubmit;
    if (!onSubmit) {
      return;
    }

    const questionnaire = formState.questionnaire;
    const response = formState.questionnaireResponse;
    const subject = propsRef.current.subject;
    let source = propsRef.current.source;
    if (!source) {
      const profile = medplum.getProfile();
      if (profile) {
        source = createReference(profile);
      }
    }
    onSubmit({
      ...response,
      questionnaire: questionnaire.url ?? getReferenceString(questionnaire),
      subject,
      source,
      authored: new Date().toISOString(),
      status: 'completed',
    });
  }, [medplum]);

  if (formState.loading) {
    return null;
  }

  return (
    <Form testid="questionnaire-form" onSubmit={handleSubmit}>
      {formState.questionnaire.title && <Title>{formState.questionnaire.title}</Title>}
      {formState.pagination ? (
        <QuestionnaireFormStepper
          formState={formState}
          submitButtonText={props.submitButtonText}
          excludeButtons={props.excludeButtons}
        >
          <QuestionnaireFormItemArray
            formState={formState}
            context={[]}
            items={formState.items}
            responseItems={formState.responseItems}
          />
        </QuestionnaireFormStepper>
      ) : (
        <>
          <QuestionnaireFormItemArray
            formState={formState}
            context={[]}
            items={formState.items}
            responseItems={formState.responseItems}
          />
          {!props.excludeButtons && (
            <Group justify="flex-end" mt="xl" gap="xs">
              <SubmitButton>{props.submitButtonText ?? 'Submit'}</SubmitButton>
            </Group>
          )}
        </>
      )}
    </Form>
  );
}

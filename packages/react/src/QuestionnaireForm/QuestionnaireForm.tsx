import { Group, Text, Title } from '@mantine/core';
import { createReference, getExtension, getReferenceString, HTTP_HL7_ORG } from '@medplum/core';
import { Encounter, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { useMedplum, useQuestionnaireForm } from '@medplum/react-hooks';
import { JSX, useCallback, useRef, useState } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';
import { SignatureInput } from '../SignatureInput/SignatureInput';
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
  const [signatureRequiredSubmitted, setSignatureRequiredSubmitted] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  const onFormChange = useCallback((response: QuestionnaireResponse) => {
    setSignatureRequiredSubmitted(false);
    propsRef.current.onChange?.(response);
  }, []);

  const formState = useQuestionnaireForm({
    questionnaire: props.questionnaire,
    defaultValue: props.questionnaireResponse,
    subject: props.subject,
    encounter: props.encounter,
    source: props.source,
    disablePagination: props.disablePagination,
    onChange: onFormChange,
  });
  const formStateRef = useRef(formState);
  formStateRef.current = formState;

  const isSignatureRequired = useCallback(() => {
    if (formState.loading) {
      return false;
    }
    return !!getExtension(
      formState.questionnaire,
      `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-signatureRequired`
    );
  }, [formState]);

  const hasSignature = useCallback(() => {
    if (formState.loading) {
      return false;
    }
    return !!formState.questionnaireResponse.extension?.find(
      (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaireresponse-signature`
    );
  }, [formState]);

  const handleSubmit = useCallback(() => {
    const formState = formStateRef.current;
    if (formState.loading) {
      return;
    }

    const onSubmit = propsRef.current.onSubmit;
    if (!onSubmit) {
      return;
    }

    if (isSignatureRequired() && !hasSignature()) {
      setSignatureRequiredSubmitted(true);
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
    console.log('response', response);
    onSubmit({
      ...response,
      questionnaire: questionnaire.url ?? getReferenceString(questionnaire),
      subject,
      source,
      authored: new Date().toISOString(),
      status: 'completed',
    });
  }, [medplum, isSignatureRequired, hasSignature]);

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
          {isSignatureRequired() && (
            <>
              <SignatureInput mt="xs" onChange={formState.onChangeSignature} />
              {!hasSignature() && signatureRequiredSubmitted && (
                <Text c="red" size="sm" mt="xs">
                  Signature is required.
                </Text>
              )}
            </>
          )}

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

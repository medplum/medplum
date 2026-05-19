// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text, Title } from '@mantine/core';
import { createReference, getExtension, getReferenceString } from '@medplum/core';
import type { Encounter, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import {
  QUESTIONNAIRE_SIGNATURE_REQUIRED_URL,
  QUESTIONNAIRE_SIGNATURE_RESPONSE_URL,
  useMedplum,
  useQuestionnaireForm,
} from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  const pendingChangeRef = useRef<QuestionnaireResponse | undefined>(undefined);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const onFormChange = useCallback((response: QuestionnaireResponse) => {
    pendingChangeRef.current = response;
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
  useLayoutEffect(() => {
    formStateRef.current = formState;
  });

  // Intentionally run after every commit.
  //
  // `useQuestionnaireForm` currently invokes its `onChange` callback while the form
  // is rendering/initializing. Calling `setState` directly from that callback caused
  // React to warn that `QuestionnaireForm` was updating a parent during render.
  //
  // To avoid that render-phase update, `onFormChange` stages the latest response in
  // `pendingChangeRef`, and this effect flushes it after commit. The effect clears
  // the ref before calling `setSignatureRequiredSubmitted(false)`, so the state
  // update does not create an infinite loop: the rerender triggered by `setState`
  // immediately exits because there is no longer a pending change to flush.
  //
  // A more complete fix would be to move `useQuestionnaireForm`'s `onChange`
  // emission out of render entirely. Until then, this effect must run on every
  // commit so it can detect newly staged ref-based changes that do not participate
  // in React's dependency tracking.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pendingChange = pendingChangeRef.current;
    if (!pendingChange) {
      return;
    }

    pendingChangeRef.current = undefined;
    setSignatureRequiredSubmitted(false);
    propsRef.current.onChange?.(pendingChange);
  });

  const isSignatureRequired = useMemo(() => {
    if (formState.loading) {
      return false;
    }
    return !!getExtension(formState.questionnaire, QUESTIONNAIRE_SIGNATURE_REQUIRED_URL);
  }, [formState]);

  const hasSignature = useMemo(() => {
    if (formState.loading) {
      return false;
    }
    return !!formState.questionnaireResponse.extension?.find((ext) => ext.url === QUESTIONNAIRE_SIGNATURE_RESPONSE_URL);
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

    if (isSignatureRequired && !hasSignature) {
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
          {isSignatureRequired && (
            <Stack mt="md" gap={0}>
              <Text size="sm" fw={500}>
                Signature
              </Text>
              <SignatureInput onChange={formState.onChangeSignature} />
              {!hasSignature && signatureRequiredSubmitted && (
                <Text c="red" size="sm">
                  Signature is required.
                </Text>
              )}
            </Stack>
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

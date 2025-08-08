// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Stepper } from '@mantine/core';
import { QuestionnaireFormPaginationState } from '@medplum/react-hooks';
import { JSX } from 'react';
import { SubmitButton } from '../Form/SubmitButton';

export interface QuestionnaireFormStepperProps {
  readonly formState: QuestionnaireFormPaginationState;
  readonly submitButtonText?: string;
  readonly excludeButtons?: boolean;
  readonly children?: React.ReactNode;
}

export function QuestionnaireFormStepper(props: QuestionnaireFormStepperProps): JSX.Element {
  const { formState, submitButtonText, excludeButtons, children } = props;
  const pages = formState.pages;
  const activePage = formState.activePage;
  const showBackButton = activePage > 0;
  const showNextButton = activePage < pages.length - 1;
  const showSubmitButton = activePage === pages.length - 1;

  return (
    <>
      <Stepper active={activePage} allowNextStepsSelect={false} p={6}>
        {pages.map((page, index) => (
          <Stepper.Step key={page.linkId} label={page.title}>
            {index === activePage && children}
          </Stepper.Step>
        ))}
      </Stepper>
      {!excludeButtons && (
        <Group justify="flex-end" mt="xl" gap="xs">
          {showBackButton && <Button onClick={formState.onPrevPage}>Back</Button>}
          {showNextButton && (
            <Button
              onClick={(e) => {
                const form = e.currentTarget.closest('form') as HTMLFormElement;
                if (form.reportValidity()) {
                  formState.onNextPage();
                }
              }}
            >
              Next
            </Button>
          )}
          {showSubmitButton && <SubmitButton>{submitButtonText ?? 'Submit'}</SubmitButton>}
        </Group>
      )}
    </>
  );
}

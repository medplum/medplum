// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { QuestionnaireFormLoadedState } from '@medplum/react-hooks';
import { JSX } from 'react';
import { QuestionnaireFormItemArray } from './QuestionnaireFormItemArray';

export interface QuestionnaireFormGroupProps {
  readonly formState: QuestionnaireFormLoadedState;
  readonly context: QuestionnaireResponseItem[];
  readonly item: QuestionnaireItem;
  readonly responseItem: QuestionnaireResponseItem;
}

export function QuestionnaireFormGroup(props: QuestionnaireFormGroupProps): JSX.Element | null {
  const newContext = [...props.context, props.responseItem];
  return (
    <div key={props.item.linkId}>
      {props.item.text && (
        <Title order={3} mb="md">
          {props.item.text}
        </Title>
      )}
      <QuestionnaireFormItemArray
        formState={props.formState}
        context={newContext}
        items={props.item.item ?? []}
        responseItems={props.responseItem.item ?? []}
      />
    </div>
  );
}

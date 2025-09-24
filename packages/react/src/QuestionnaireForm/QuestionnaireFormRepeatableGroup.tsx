// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { QuestionnaireFormLoadedState } from '@medplum/react-hooks';
import { JSX } from 'react';
import { QuestionnaireFormGroup } from './QuestionnaireFormGroup';

export interface QuestionnaireFormRepeatableGroupProps {
  readonly formState: QuestionnaireFormLoadedState;
  readonly context: QuestionnaireResponseItem[];
  readonly item: QuestionnaireItem;
  readonly responseItems: QuestionnaireResponseItem[];
}

export function QuestionnaireFormRepeatableGroup(props: QuestionnaireFormRepeatableGroupProps): JSX.Element | null {
  return (
    <>
      {props.responseItems.map((response) => (
        <QuestionnaireFormGroup
          key={`group-${response.id}`}
          formState={props.formState}
          context={props.context}
          item={props.item}
          responseItem={response}
        />
      ))}
      <Anchor
        onClick={() => props.formState.onAddGroup(props.context, props.item)}
      >{`Add Group: ${props.item.text}`}</Anchor>
    </>
  );
}

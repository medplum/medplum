// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Stack } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { QuestionnaireFormLoadedState, QuestionnaireItemType } from '@medplum/react-hooks';
import { JSX } from 'react';
import { FormSection } from '../FormSection/FormSection';
import { QuestionnaireFormItem } from './QuestionnaireFormItem';

export interface QuestionnaireFormRepeatableItemProps {
  readonly formState: QuestionnaireFormLoadedState;
  readonly context: QuestionnaireResponseItem[];
  readonly item: QuestionnaireItem;
  readonly responseItem: QuestionnaireResponseItem;
}

export function QuestionnaireFormRepeatableItem(props: QuestionnaireFormRepeatableItemProps): JSX.Element | null {
  const { formState, context, item, responseItem } = props;
  const showAddButton = item.type !== QuestionnaireItemType.choice && item.type !== QuestionnaireItemType.openChoice;
  const answers = responseItem.answer && responseItem.answer.length > 0 ? responseItem.answer : [{}];
  return (
    <FormSection
      key={props.item.linkId}
      htmlFor={props.item.linkId}
      title={props.item.text}
      withAsterisk={props.item.required}
    >
      <Stack gap="xs">
        {answers?.map((_, index) => (
          <QuestionnaireFormItem
            key={`${item.linkId}-${index}`}
            formState={formState}
            context={context}
            item={item}
            responseItem={responseItem}
            index={index}
          />
        ))}
      </Stack>
      {showAddButton && <Anchor onClick={() => formState.onAddAnswer(context, item)}>Add Item</Anchor>}
    </FormSection>
  );
}

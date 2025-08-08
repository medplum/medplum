// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { isQuestionEnabled, QuestionnaireFormLoadedState, QuestionnaireItemType } from '@medplum/react-hooks';
import { JSX } from 'react';
import { FormSection } from '../FormSection/FormSection';
import { QuestionnaireFormGroup } from './QuestionnaireFormGroup';
import { QuestionnaireFormItem } from './QuestionnaireFormItem';
import { QuestionnaireFormRepeatableGroup } from './QuestionnaireFormRepeatableGroup';
import { QuestionnaireFormRepeatableItem } from './QuestionnaireFormRepeatableItem';

export interface QuestionnaireFormItemArrayProps {
  readonly formState: QuestionnaireFormLoadedState;
  readonly context: QuestionnaireResponseItem[];
  readonly items: QuestionnaireItem[];
  readonly responseItems: QuestionnaireResponseItem[];
}

export function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  const { formState, context, items, responseItems } = props;
  return (
    <Stack>
      {items.map((item, index) => {
        if (!isQuestionEnabled(item, formState.questionnaireResponse)) {
          return null;
        }
        if (item.type === QuestionnaireItemType.display) {
          return <p key={`display-${item.id}-${index}`}>{item.text}</p>;
        }
        const filteredResponseItems = responseItems.filter((responseItem) => responseItem.linkId === item.linkId);
        if (item.type === QuestionnaireItemType.group && item.repeats) {
          return (
            <QuestionnaireFormRepeatableGroup
              key={`repeating-group-${item.id}-${index}`}
              formState={formState}
              context={context}
              item={item}
              responseItems={filteredResponseItems}
            />
          );
        } else if (item.type === QuestionnaireItemType.group) {
          return (
            <QuestionnaireFormGroup
              key={`group-${item.id}-${index}`}
              formState={formState}
              context={context}
              item={item}
              responseItem={filteredResponseItems[0]}
            />
          );
        } else if (item.type === QuestionnaireItemType.boolean) {
          // Special case for boolean items to avoid duplicate text
          return (
            <QuestionnaireFormItem
              key={`boolean-item-${item.id}-${index}`}
              formState={formState}
              context={context}
              item={item}
              responseItem={filteredResponseItems[0]}
              index={0}
            />
          );
        } else if (item.repeats) {
          return (
            <QuestionnaireFormRepeatableItem
              key={`repeating-item-${item.id}-${index}`}
              formState={formState}
              context={context}
              item={item}
              responseItem={filteredResponseItems[0]}
            />
          );
        } else {
          return (
            <FormSection
              key={`repeating-item-${item.id}-${index}`}
              htmlFor={item.linkId}
              title={item.text}
              withAsterisk={item.required}
            >
              <QuestionnaireFormItem
                formState={formState}
                context={context}
                item={item}
                responseItem={filteredResponseItems[0]}
                index={0}
              />
            </FormSection>
          );
        }
      })}
    </Stack>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Stack } from '@mantine/core';
import type { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import type { QuestionnaireFormLoadedState } from '@medplum/react-hooks';
import { isQuestionEnabled, QuestionnaireItemType } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { Fragment } from 'react';
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
  const isTopLevel = context.length === 0;
  // Tracks whether a top-level group has already been rendered so we can
  // insert a divider before each subsequent group section.
  let hasRenderedSection = false;

  return (
    <Stack gap="xl">
      {items.map((item, index) => {
        if (!isQuestionEnabled(item, formState.questionnaireResponse)) {
          return null;
        }
        const isGroup = item.type === QuestionnaireItemType.group;
        const showSectionDivider = isTopLevel && isGroup && hasRenderedSection;
        if (isGroup) {
          hasRenderedSection = true;
        }

        if (item.type === QuestionnaireItemType.display) {
          return <p key={`display-${item.id}-${index}`}>{item.text}</p>;
        }

        const filteredResponseItems = responseItems.filter((responseItem) => responseItem.linkId === item.linkId);

        if (item.type === QuestionnaireItemType.group && item.repeats) {
          return (
            <Fragment key={`repeating-group-${item.id}-${index}`}>
              {showSectionDivider && <Divider color="var(--mantine-color-gray-2)" />}
              <QuestionnaireFormRepeatableGroup
                formState={formState}
                context={context}
                item={item}
                responseItems={filteredResponseItems}
              />
            </Fragment>
          );
        }

        if (item.type === QuestionnaireItemType.group) {
          return (
            <Fragment key={`group-${item.id}-${index}`}>
              {showSectionDivider && <Divider color="var(--mantine-color-gray-2)" />}
              <QuestionnaireFormGroup
                formState={formState}
                context={context}
                item={item}
                responseItem={filteredResponseItems[0]}
              />
            </Fragment>
          );
        }

        if (item.type === QuestionnaireItemType.boolean) {
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
        }

        if (item.repeats) {
          return (
            <QuestionnaireFormRepeatableItem
              key={`repeating-item-${item.id}-${index}`}
              formState={formState}
              context={context}
              item={item}
              responseItem={filteredResponseItems[0]}
            />
          );
        }

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
      })}
    </Stack>
  );
}

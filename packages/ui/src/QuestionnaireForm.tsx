import { createReference, ElementDefinition, getReferenceString, ProfileResource, Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem, Reference } from '@medplum/core';
import React from 'react';
import { AttachmentInput } from './AttachmentInput';
import { Button } from './Button';
import { CodingInput } from './CodingInput';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { useMedplum } from './MedplumProvider';
import { QuestionnaireItemType } from './QuestionnaireUtils';
import { ReferenceInput } from './ReferenceInput';
import { useResource } from './useResource';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps) {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const questionnaire = useResource(props.questionnaire);

  if (!questionnaire) {
    return null;
  }

  return (
    <Form
      testid="questionnaire-form"
      onSubmit={(formData: Record<string, string>) => {
        const items: QuestionnaireResponseItem[] = Object.entries(formData).map(([linkId, value]) => ({
          linkId,
          answer: [{
            valueString: value
          }]
        }));

        const response: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          questionnaire: getReferenceString(questionnaire),
          source: createReference(source as ProfileResource),
          authored: new Date().toISOString(),
          item: items
        };

        if (props.onSubmit) {
          props.onSubmit(response);
        }
      }}>
      {questionnaire.item && (
        <QuestionnaireFormItemArray items={questionnaire.item} />
      )}
      <Button type="submit" size="large">OK</Button>
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  items: QuestionnaireItem[];
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  return (
    <>
      {props.items.map(item => item.type === QuestionnaireItemType.group ? (
        <QuestionnaireFormItem key={item.linkId} item={item} />
      ) : (
        <FormSection key={item.linkId} htmlFor={item.linkId} title={item.text || ''}>
          <QuestionnaireFormItem item={item} />
        </FormSection>
      ))}
    </>
  );
}

interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
}

function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
  const item = props.item;

  const type = item.type as QuestionnaireItemType;
  if (!type) {
    return null;
  }

  const name = item.linkId;
  if (!name) {
    return null;
  }

  const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;

  const property: ElementDefinition = {} as ElementDefinition;

  switch (type) {
    case QuestionnaireItemType.group:
    case QuestionnaireItemType.display:
      return (
        <div>
          <h3>{item.text}</h3>
          {item.item && (
            <QuestionnaireFormItemArray items={item.item} />
          )}
        </div>
      );
    case QuestionnaireItemType.boolean:
      return (
        <input type="checkbox" id={name} name={name} value="true" defaultChecked={initial?.valueBoolean} />
      );
    case QuestionnaireItemType.decimal:
      return (
        <input type="number" id={name} name={name} defaultValue={initial?.valueDecimal} />
      );
    case QuestionnaireItemType.integer:
      return (
        <input type="number" id={name} name={name} defaultValue={initial?.valueInteger} />
      );
    case QuestionnaireItemType.date:
      return (
        <input type="date" id={name} name={name} defaultValue={initial?.valueDate} />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <input type="datetime-local" id={name} name={name} step="1" defaultValue={initial?.valueDateTime} />
      );
    case QuestionnaireItemType.time:
      return (
        <input type="time" id={name} name={name} defaultValue={initial?.valueTime} />
      );
    case QuestionnaireItemType.string:
      return (
        <input type="text" id={name} name={name} defaultValue={initial?.valueString} />
      );
    case QuestionnaireItemType.text:
      return (
        <textarea id={name} name={name} defaultValue={initial?.valueString} />
      );
    case QuestionnaireItemType.url:
      return (
        <input type="url" id={name} name={name} defaultValue={initial?.valueUri} />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      return (
        <CodingInput property={property} name={name} defaultValue={initial?.valueCoding} />
      );
    case QuestionnaireItemType.attachment:
      return (
        <AttachmentInput name={name} defaultValue={initial?.valueAttachment} />
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput property={property} name={name} defaultValue={initial?.valueReference} />
      );
    case QuestionnaireItemType.quantity:
      return (
        <input type="number" id={name} name={name} defaultValue={initial?.valueQuantity?.value} />
      );
  }

  return null;
}

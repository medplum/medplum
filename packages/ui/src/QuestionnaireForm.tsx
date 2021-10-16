import { createReference, ElementDefinition, getReferenceString, ProfileResource, PropertyType, Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem, Reference } from '@medplum/core';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentInput } from './AttachmentInput';
import { Button } from './Button';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodeInput } from './CodeInput';
import { CodingInput } from './CodingInput';
import { ContactPointInput } from './ContactPointInput';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { useMedplum } from './MedplumProvider';
import { QuestionnaireItemType } from './QuestionnaireUtils';
import { ReferenceInput } from './ReferenceInput';
import { useResource } from './useResource';

export interface QuestionnaireFormProps {
  questionnaire: Reference | Questionnaire;
  onSubmit: (formData: any) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps) {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const questionnaire = useResource(props.questionnaire) as Questionnaire | undefined;

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
        <FormSection key={item.linkId} title={item.text || ''}>
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

  const type = item.type as QuestionnaireItemType | PropertyType;
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
      return (
        <div>
          <h3>{item.text}</h3>
          {item.item && (
            <QuestionnaireFormItemArray items={item.item} />
          )}
        </div>
      );
    case PropertyType.SystemString:
    case PropertyType.string:
      return (
        <input type="text" name={name} data-testid={name} defaultValue={initial?.valueString} />
      );
    case PropertyType.date:
      return (
        <input type="date" name={name} data-testid={name} defaultValue={initial?.valueDate} />
      );
    case PropertyType.dateTime:
    case PropertyType.instant:
      return (
        <input type="datetime-local" name={name} data-testid={name} defaultValue={initial?.valueDateTime} />
      );
    case PropertyType.time:
      return (
        <input type="time" name={name} data-testid={name} defaultValue={initial?.valueTime} />
      );
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <input type="url" name={name} data-testid={name} defaultValue={initial?.valueUri} />
      );
    case PropertyType.decimal:
      return (
        <input type="number" name={name} data-testid={name} defaultValue={initial?.valueDecimal} />
      );
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <input type="number" name={name} data-testid={name} defaultValue={initial?.valueInteger} />
      );
    case PropertyType.code:
      return <CodeInput property={property} name={name} defaultValue={initial?.valueString} />;
    case PropertyType.boolean:
      return (
        <input type="checkbox" name={name} value="true" />
      );
    case PropertyType.markdown:
      return (
        <textarea name={name} />
      );
    case PropertyType.Address:
      return <AddressInput name={name} />;
    case PropertyType.Attachment:
      return <AttachmentInput name={name} />;
    case PropertyType.CodeableConcept:
      return <CodeableConceptInput property={property} name={name} />;
    case PropertyType.Coding:
      return <CodingInput property={property} name={name} defaultValue={initial?.valueCoding} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} />;
    case PropertyType.canonical:
    case PropertyType.Reference:
      return <ReferenceInput property={property} name={name} defaultValue={initial?.valueReference} />;
  }

  return null;
}

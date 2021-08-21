import { createReference, ElementDefinition, getReferenceString, PropertyType, Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem, Reference, Resource } from '@medplum/core';
import React from 'react';
import { AddressInput } from './AddressInput';
import { AttachmentInput } from './AttachmentInput';
import { Button } from './Button';
import { CodeableConceptInput } from './CodeableConceptInput';
import { CodeInput } from './CodeInput';
import { ContactPointInput } from './ContactPointInput';
import { FormSection } from './FormSection';
import { parseForm } from './FormUtils';
import { HumanNameInput } from './HumanNameInput';
import { IdentifierInput } from './IdentifierInput';
import { useMedplum } from './MedplumProvider';
import { ReferenceInput } from './ReferenceInput';
import { useResource } from './useResource';

export enum QuestionnaireItemType {
  group = 'group',
  display = 'display',
}

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
    <form
      data-testid="questionnaire-form"
      noValidate
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();

        const formData = parseForm(e.target as HTMLFormElement);

        const items: QuestionnaireResponseItem[] = Object.entries(formData).map(([linkId, value]) => ({
          linkId,
          answer: [{
            valueString: value
          }]
        }));

        const response: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          questionnaire: getReferenceString(questionnaire),
          source: createReference(source as Resource),
          authored: new Date().toISOString(),
          item: items
        };

        if (props.onSubmit) {
          props.onSubmit(response);
        }
      }}>
      {questionnaire.item?.map(item => (
        <FormSection key={item.linkId} title={item.text || ''}>
          <QuestionnaireFormItem item={item} />
        </FormSection>
      ))}
      <Button type="submit" size="large">OK</Button>
    </form>
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

  const property: ElementDefinition = {} as ElementDefinition;

  switch (type) {
    case PropertyType.SystemString:
    case PropertyType.canonical:
    case PropertyType.date:
    case PropertyType.dateTime:
    case PropertyType.instant:
    case PropertyType.string:
    case PropertyType.uri:
    case PropertyType.url:
      return (
        <input type="text" name={name} data-testid={name}></input>
      );
    case PropertyType.integer:
    case PropertyType.positiveInt:
    case PropertyType.unsignedInt:
      return (
        <input type="number" name={name} data-testid={name}></input>
      );
    case PropertyType.code:
    case PropertyType.Coding:
      return <CodeInput property={property} name={name} />;
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
      return <CodeableConceptInput name={name} />;
    case PropertyType.ContactPoint:
      return <ContactPointInput name={name} />;
    case PropertyType.HumanName:
      return <HumanNameInput name={name} />;
    case PropertyType.Identifier:
      return <IdentifierInput name={name} />;
    case PropertyType.Reference:
      return <ReferenceInput property={property} name={name} />;
  }

  return null;
}

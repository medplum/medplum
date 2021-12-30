import { createReference, getReferenceString, IndexedStructureDefinition, ProfileResource } from '@medplum/core';
import {
  ElementDefinition,
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Reference,
} from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { Button } from './Button';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { useMedplum } from './MedplumProvider';
import { QuantityInput } from './QuantityInput';
import { QuestionnaireItemType } from './QuestionnaireUtils';
import { ReferenceInput } from './ReferenceInput';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { useResource } from './useResource';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  subject?: Reference;
  onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps) {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const questionnaire = useResource(props.questionnaire);

  useEffect(() => {
    medplum.requestSchema('Questionnaire').then(setSchema);
  }, []);

  if (!schema || !questionnaire) {
    return null;
  }

  return (
    <Form
      testid="questionnaire-form"
      onSubmit={(formData: Record<string, string>) => {
        const items: QuestionnaireResponseItem[] = Object.entries(formData).map(([linkId, value]) => ({
          linkId,
          answer: [
            {
              valueString: value,
            },
          ],
        }));

        const response: QuestionnaireResponse = {
          resourceType: 'QuestionnaireResponse',
          questionnaire: getReferenceString(questionnaire),
          subject: props.subject,
          source: createReference(source as ProfileResource),
          authored: new Date().toISOString(),
          item: items,
        };

        if (props.onSubmit) {
          props.onSubmit(response);
        }
      }}
    >
      {questionnaire.title && <h1>{questionnaire.title}</h1>}
      {questionnaire.item && <QuestionnaireFormItemArray schema={schema} items={questionnaire.item} />}
      <Button type="submit" size="large">
        OK
      </Button>
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  schema: IndexedStructureDefinition;
  items: QuestionnaireItem[];
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  return (
    <>
      {props.items.map((item) =>
        item.type === QuestionnaireItemType.group ? (
          <QuestionnaireFormItem key={item.linkId} schema={props.schema} item={item} />
        ) : (
          <FormSection key={item.linkId} htmlFor={item.linkId} title={item.text || ''}>
            <QuestionnaireFormItem schema={props.schema} item={item} />
          </FormSection>
        )
      )}
    </>
  );
}

export interface QuestionnaireFormItemProps {
  schema: IndexedStructureDefinition;
  item: QuestionnaireItem;
}

export function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
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
      return (
        <div>
          <h3>{item.text}</h3>
          {item.item && <QuestionnaireFormItemArray schema={props.schema} items={item.item} />}
        </div>
      );
    case QuestionnaireItemType.boolean:
      return <input type="checkbox" id={name} name={name} value="true" defaultChecked={initial?.valueBoolean} />;
    case QuestionnaireItemType.decimal:
      return <input type="number" step={0.01} id={name} name={name} defaultValue={initial?.valueDecimal} />;
    case QuestionnaireItemType.integer:
      return <input type="number" step={1} id={name} name={name} defaultValue={initial?.valueInteger} />;
    case QuestionnaireItemType.date:
      return <input type="date" id={name} name={name} defaultValue={initial?.valueDate} />;
    case QuestionnaireItemType.dateTime:
      return <input type="datetime-local" id={name} name={name} step="1" defaultValue={initial?.valueDateTime} />;
    case QuestionnaireItemType.time:
      return <input type="time" id={name} name={name} defaultValue={initial?.valueTime} />;
    case QuestionnaireItemType.string:
      return <input type="text" id={name} name={name} defaultValue={initial?.valueString} />;
    case QuestionnaireItemType.text:
      return <textarea id={name} name={name} defaultValue={initial?.valueString} />;
    case QuestionnaireItemType.url:
      return <input type="url" id={name} name={name} defaultValue={initial?.valueUri} />;
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      return (
        <table style={{ width: '100%' }}>
          <tbody>
            {item.answerOption &&
              item.answerOption.map((option: QuestionnaireItemAnswerOption) => {
                const valueProperty = props.schema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
                const [propertyValue, propertyType] = getValueAndType(option, valueProperty);
                return (
                  <tr key={JSON.stringify(option)}>
                    <td style={{ width: '50px' }}>
                      <input type="radio" id={name} name={name} value={propertyValue} />
                    </td>
                    <td>
                      <ResourcePropertyDisplay
                        schema={props.schema}
                        property={valueProperty}
                        propertyType={propertyType}
                        value={propertyValue}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      );
    case QuestionnaireItemType.attachment:
      return <AttachmentInput name={name} defaultValue={initial?.valueAttachment} />;
    case QuestionnaireItemType.reference:
      return <ReferenceInput property={property} name={name} defaultValue={initial?.valueReference} />;
    case QuestionnaireItemType.quantity:
      return <QuantityInput name={name} defaultValue={initial?.valueQuantity} />;
  }

  return null;
}

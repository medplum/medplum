import {
  capitalize,
  createReference,
  getReferenceString,
  getTypedPropertyValue,
  globalSchema,
  IndexedStructureDefinition,
  ProfileResource,
  PropertyType,
  stringify,
  TypedValue,
} from '@medplum/core';
import {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemInitial,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import React, { ChangeEvent, useEffect, useState } from 'react';
import { AttachmentInput } from './AttachmentInput';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { CheckboxFormSection } from './CheckboxFormSection';
import { DateTimeInput } from './DateTimeInput';
import { Form } from './Form';
import { FormSection } from './FormSection';
import { Input } from './Input';
import { useMedplum } from './MedplumProvider';
import { QuantityInput } from './QuantityInput';
import { QuestionnaireItemType } from './QuestionnaireUtils';
import { ReferenceInput } from './ReferenceInput';
import { ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import { TextArea } from './TextArea';
import { useResource } from './useResource';
import './QuestionnaireForm.css';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  subject?: Reference;
  onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const questionnaire = useResource(props.questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();

  useEffect(() => {
    medplum.requestSchema('Questionnaire').then(setSchema).catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire]);

  function setItems(newResponseItems: QuestionnaireResponseItem[]): void {
    setResponse({
      resourceType: 'QuestionnaireResponse',
      item: newResponseItems,
    });
  }

  if (!schema || !questionnaire) {
    return null;
  }

  return (
    <Form
      testid="questionnaire-form"
      onSubmit={() => {
        if (props.onSubmit && response) {
          props.onSubmit({
            ...response,
            questionnaire: getReferenceString(questionnaire),
            subject: props.subject,
            source: createReference(source as ProfileResource),
            authored: new Date().toISOString(),
          });
        }
      }}
    >
      {questionnaire.title && <h1>{questionnaire.title}</h1>}
      {questionnaire.item && <QuestionnaireFormItemArray items={questionnaire.item} onChange={setItems} />}
      <Button type="submit" size="large">
        OK
      </Button>
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  items: QuestionnaireItem[];
  onChange: (newResponseItems: QuestionnaireResponseItem[]) => void;
}

function QuestionnaireFormItemArray(props: QuestionnaireFormItemArrayProps): JSX.Element {
  const [responseItems, setResponseItems] = useState<QuestionnaireResponseItem[]>(
    buildInitialResponseItems(props.items)
  );

  function setResponseItem(index: number, newResponseItem: QuestionnaireResponseItem): void {
    const newResponseItems = responseItems.slice();
    newResponseItems[index] = newResponseItem;
    setResponseItems(newResponseItems);
    props.onChange(newResponseItems);
  }

  return (
    <>
      {props.items.map((item, index) => {
        if (item.type === QuestionnaireItemType.display) {
          return <p key={item.linkId}>{item.text}</p>;
        }
        if (item.type === QuestionnaireItemType.group) {
          return (
            <QuestionnaireFormItem
              key={item.linkId}
              item={item}
              onChange={(newResponseItem) => setResponseItem(index, newResponseItem)}
            />
          );
        }
        if (item.type === QuestionnaireItemType.boolean) {
          const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;
          return (
            <CheckboxFormSection key={item.linkId} title={item.text} htmlFor={item.linkId}>
              <Checkbox
                name={item.linkId}
                defaultValue={initial?.valueBoolean}
                onChange={(newValue) =>
                  setResponseItem(index, {
                    linkId: item.linkId,
                    text: item.text,
                    answer: [{ valueBoolean: newValue }],
                  })
                }
              />
            </CheckboxFormSection>
          );
        }
        return (
          <FormSection key={item.linkId} htmlFor={item.linkId} title={item.text || ''}>
            <QuestionnaireFormItem
              item={item}
              onChange={(newResponseItem) => setResponseItem(index, newResponseItem)}
            />
          </FormSection>
        );
      })}
    </>
  );
}

export interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
  onChange: (newResponseItem: QuestionnaireResponseItem) => void;
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

  function onChangeItem(newResponseItems: QuestionnaireResponseItem[]): void {
    props.onChange({
      linkId: item.linkId,
      text: item.text,
      item: newResponseItems,
    });
  }

  function onChangeAnswer(newResponseAnswer: QuestionnaireResponseItemAnswer): void {
    props.onChange({
      linkId: item.linkId,
      text: item.text,
      answer: [newResponseAnswer],
    });
  }

  switch (type) {
    case QuestionnaireItemType.group:
      return (
        <div>
          <h3>{item.text}</h3>
          {item.item && <QuestionnaireFormItemArray items={item.item} onChange={onChangeItem} />}
        </div>
      );
    case QuestionnaireItemType.boolean:
      return (
        <Checkbox
          name={name}
          defaultValue={initial?.valueBoolean}
          onChange={(newValue) => onChangeAnswer({ valueBoolean: newValue })}
        />
      );
    case QuestionnaireItemType.decimal:
      return (
        <Input
          type="number"
          step="any"
          name={name}
          defaultValue={initial?.valueDecimal}
          onChange={(newValue) => onChangeAnswer({ valueDecimal: parseFloat(newValue) })}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <Input
          type="number"
          step={1}
          name={name}
          defaultValue={initial?.valueInteger}
          onChange={(newValue) => onChangeAnswer({ valueInteger: parseInt(newValue) })}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <Input
          type="date"
          name={name}
          defaultValue={initial?.valueDate}
          onChange={(newValue) => onChangeAnswer({ valueDate: newValue })}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          type="datetime-local"
          name={name}
          defaultValue={initial?.valueDateTime}
          onChange={(newValue) => onChangeAnswer({ valueDateTime: newValue })}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <Input
          type="time"
          name={name}
          defaultValue={initial?.valueTime}
          onChange={(newValue) => onChangeAnswer({ valueTime: newValue })}
        />
      );
    case QuestionnaireItemType.string:
      return (
        <Input
          type="text"
          name={name}
          defaultValue={initial?.valueString}
          onChange={(newValue) => onChangeAnswer({ valueString: newValue })}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <TextArea
          name={name}
          defaultValue={initial?.valueString}
          onChange={(newValue) => onChangeAnswer({ valueString: newValue })}
        />
      );
    case QuestionnaireItemType.url:
      return (
        <Input
          type="url"
          name={name}
          defaultValue={initial?.valueUri}
          onChange={(newValue) => onChangeAnswer({ valueUri: newValue })}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <AttachmentInput
          name={name}
          defaultValue={initial?.valueAttachment}
          onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue })}
        />
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={name}
          defaultValue={initial?.valueReference}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue })}
        />
      );
    case QuestionnaireItemType.quantity:
      return (
        <QuantityInput
          name={name}
          defaultValue={initial?.valueQuantity}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue })}
        />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item)) {
        return (
          <QuestionnaireChoiceDropDownInput name={name} item={item} initial={initial} onChangeAnswer={onChangeAnswer} />
        );
      } else {
        return (
          <QuestionnaireChoiceRadioInput name={name} item={item} initial={initial} onChangeAnswer={onChangeAnswer} />
        );
      }
  }

  return null;
}

interface QuestionnaireChoiceInputProps {
  name: string;
  item: QuestionnaireItem;
  initial: QuestionnaireItemInitial | undefined;
  onChangeAnswer: (newResponseAnswer: QuestionnaireResponseItemAnswer) => void;
}

function QuestionnaireChoiceDropDownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial } = props;
  const valueElementDefinition = globalSchema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;

  return (
    <select
      id={name}
      name={name}
      className="medplum-select"
      onChange={(e: ChangeEvent<HTMLSelectElement>) => {
        const index = e.currentTarget.selectedIndex;
        if (index === 0) {
          props.onChangeAnswer({});
          return;
        }
        const option = (item.answerOption as QuestionnaireItemAnswerOption[])[index - 1];
        const optionValue = getTypedPropertyValue(
          { type: 'QuestionnaireItemAnswerOption', value: option },
          'value'
        ) as TypedValue;
        const propertyName = 'value' + capitalize(optionValue.type);
        props.onChangeAnswer({ [propertyName]: optionValue.value });
      }}
    >
      <option></option>
      {item.answerOption &&
        item.answerOption.map((option: QuestionnaireItemAnswerOption, index: number) => {
          const optionValue = getTypedPropertyValue(
            { type: 'QuestionnaireItemAnswerOption', value: option },
            'value'
          ) as TypedValue;
          const optionName = `${name}-option-${index}`;
          return (
            <option
              key={optionName}
              value={optionValue.value}
              selected={initialValue && stringify(optionValue) === stringify(initialValue)}
            >
              <ResourcePropertyDisplay
                property={valueElementDefinition}
                propertyType={optionValue.type as PropertyType}
                value={optionValue.value}
              />
            </option>
          );
        })}
    </select>
  );
}

function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer } = props;
  const valueElementDefinition = globalSchema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;
  return (
    <>
      {item.answerOption &&
        item.answerOption.map((option: QuestionnaireItemAnswerOption, index: number) => {
          const optionValue = getTypedPropertyValue(
            { type: 'QuestionnaireItemAnswerOption', value: option },
            'value'
          ) as TypedValue;
          const propertyName = 'value' + capitalize(optionValue.type);
          const optionName = `${name}-option-${index}`;
          return (
            <div key={optionName} className="medplum-questionnaire-option-row">
              <div className="medplum-questionnaire-option-checkbox">
                <input
                  type="radio"
                  id={optionName}
                  name={name}
                  value={optionValue.value}
                  defaultChecked={initialValue && stringify(optionValue) === stringify(initialValue)}
                  onChange={() => onChangeAnswer({ [propertyName]: optionValue.value })}
                />
              </div>
              <div>
                <label htmlFor={optionName}>
                  <ResourcePropertyDisplay
                    property={valueElementDefinition}
                    propertyType={optionValue.type as PropertyType}
                    value={optionValue.value}
                  />
                </label>
              </div>
            </div>
          );
        })}
    </>
  );
}

function buildInitialResponse(questionnaire: Questionnaire): QuestionnaireResponse {
  const response: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    questionnaire: getReferenceString(questionnaire),
    item: buildInitialResponseItems(questionnaire.item),
  };

  return response;
}

function buildInitialResponseItems(items: QuestionnaireItem[] | undefined): QuestionnaireResponseItem[] {
  return items?.map(buildInitialResponseItem) ?? [];
}

function buildInitialResponseItem(item: QuestionnaireItem): QuestionnaireResponseItem {
  return {
    linkId: item.linkId,
    text: item.text,
    item: buildInitialResponseItems(item.item),
    answer: item.initial?.map(buildInitialResponseAnswer) ?? [],
  };
}

function buildInitialResponseAnswer(answer: QuestionnaireItemInitial): QuestionnaireResponseItemAnswer {
  // This works because QuestionnaireItemInitial and QuestionnaireResponseItemAnswer
  // have the same properties.
  return { ...answer };
}

function isDropDownChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
  );
}

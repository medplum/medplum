import { Button, Checkbox, Group, NativeSelect, Radio, Stack, Textarea, TextInput, Title } from '@mantine/core';
import {
  capitalize,
  createReference,
  deepEquals,
  getQuestionnaireAnswers,
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
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { Form } from '../Form/Form';
import { FormSection } from '../FormSection/FormSection';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { useResource } from '../useResource/useResource';
import { QuestionnaireItemType } from '../utils/questionnaire';

export interface QuestionnaireFormProps {
  questionnaire: Questionnaire | Reference<Questionnaire>;
  subject?: Reference;
  submitButtonText?: string;
  onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const medplum = useMedplum();
  const source = medplum.getProfile();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const questionnaire = useResource(props.questionnaire);
  const [response, setResponse] = useState<QuestionnaireResponse | undefined>();
  const [answers, setAnswers] = useState<Record<string, QuestionnaireResponseItemAnswer>>({});

  useEffect(() => {
    medplum
      .requestSchema('Questionnaire')
      .then(() => medplum.requestSchema('QuestionnaireResponse'))
      .then(setSchema)
      .catch(console.log);
  }, [medplum]);

  useEffect(() => {
    setResponse(questionnaire ? buildInitialResponse(questionnaire) : undefined);
  }, [questionnaire]);

  function setItems(newResponseItems: QuestionnaireResponseItem[]): void {
    const newResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      item: newResponseItems,
    };
    setResponse(newResponse);
    setAnswers(getQuestionnaireAnswers(newResponse));
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
            status: 'completed',
          });
        }
      }}
    >
      {questionnaire.title && <Title>{questionnaire.title}</Title>}
      {questionnaire.item && (
        <QuestionnaireFormItemArray items={questionnaire.item} answers={answers} onChange={setItems} />
      )}
      <Group position="right" mt="xl">
        <Button type="submit">{props.submitButtonText || 'OK'}</Button>
      </Group>
    </Form>
  );
}

interface QuestionnaireFormItemArrayProps {
  items: QuestionnaireItem[];
  answers: Record<string, QuestionnaireResponseItemAnswer>;
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
    <Stack>
      {props.items.map((item, index) => {
        if (!isQuestionEnabled(item, props.answers)) {
          return null;
        }
        if (item.type === QuestionnaireItemType.display) {
          return <p key={item.linkId}>{item.text}</p>;
        }
        if (item.type === QuestionnaireItemType.group) {
          return (
            <QuestionnaireFormItem
              key={item.linkId}
              item={item}
              answers={props.answers}
              onChange={(newResponseItem) => setResponseItem(index, newResponseItem)}
            />
          );
        }
        if (item.type === QuestionnaireItemType.boolean) {
          const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;
          return (
            <CheckboxFormSection key={item.linkId} title={item.text} htmlFor={item.linkId}>
              <Checkbox
                id={item.linkId}
                name={item.linkId}
                defaultChecked={initial?.valueBoolean}
                onChange={(e) =>
                  setResponseItem(index, {
                    linkId: item.linkId,
                    text: item.text,
                    answer: [{ valueBoolean: e.currentTarget.checked }],
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
              answers={props.answers}
              onChange={(newResponseItem) => setResponseItem(index, newResponseItem)}
            />
          </FormSection>
        );
      })}
    </Stack>
  );
}

export interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
  answers: Record<string, QuestionnaireResponseItemAnswer>;
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
          {item.item && (
            <QuestionnaireFormItemArray items={item.item} answers={props.answers} onChange={onChangeItem} />
          )}
        </div>
      );
    case QuestionnaireItemType.boolean:
      return (
        <Checkbox
          id={name}
          name={name}
          defaultChecked={initial?.valueBoolean}
          onChange={(e) => onChangeAnswer({ valueBoolean: e.currentTarget.checked })}
        />
      );
    case QuestionnaireItemType.decimal:
      return (
        <TextInput
          type="number"
          step="any"
          id={name}
          name={name}
          defaultValue={initial?.valueDecimal}
          onChange={(e) => onChangeAnswer({ valueDecimal: e.currentTarget.valueAsNumber })}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          defaultValue={initial?.valueInteger}
          onChange={(e) => onChangeAnswer({ valueInteger: e.currentTarget.valueAsNumber })}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          defaultValue={initial?.valueDate}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={name}
          defaultValue={initial?.valueDateTime}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue })}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <TextInput
          type="time"
          id={name}
          name={name}
          defaultValue={initial?.valueTime}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return (
        <TextInput
          id={name}
          name={name}
          defaultValue={initial?.valueString}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={name}
          name={name}
          defaultValue={initial?.valueString}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
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
          disableWheel
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
    default:
      return null;
  }
}

interface QuestionnaireChoiceInputProps {
  name: string;
  item: QuestionnaireItem;
  initial: QuestionnaireItemInitial | undefined;
  onChangeAnswer: (newResponseAnswer: QuestionnaireResponseItemAnswer) => void;
}

function QuestionnaireChoiceDropDownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial } = props;
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;

  const data = [''];
  if (item.answerOption) {
    for (const option of item.answerOption) {
      const optionValue = getTypedPropertyValue(
        { type: 'QuestionnaireItemAnswerOption', value: option },
        'value'
      ) as TypedValue;
      data.push(typedValueToString(optionValue) as string);
    }
  }

  return (
    <NativeSelect
      id={name}
      name={name}
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
      defaultValue={typedValueToString(initialValue)}
      data={data}
    />
  );
}

function typedValueToString(typedValue: TypedValue | undefined): string | undefined {
  if (!typedValue) {
    return undefined;
  }
  if (typedValue.type === 'CodeableConcept') {
    return typedValue.value.coding[0].display;
  }
  if (typedValue.type === 'Coding') {
    return typedValue.value.display;
  }
  return typedValue.value.toString();
}

function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer } = props;
  const valueElementDefinition = globalSchema.types['QuestionnaireItemAnswerOption'].properties['value[x]'];
  const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
    | TypedValue
    | undefined;

  const options: [string, TypedValue][] = [];
  let defaultValue = undefined;
  if (item.answerOption) {
    for (let i = 0; i < item.answerOption.length; i++) {
      const option = item.answerOption[i];
      const optionName = `${name}-option-${i}`;
      const optionValue = getTypedPropertyValue(
        { type: 'QuestionnaireItemAnswerOption', value: option },
        'value'
      ) as TypedValue;
      if (initialValue && stringify(optionValue) === stringify(initialValue)) {
        defaultValue = optionName;
      }
      options.push([optionName, optionValue]);
    }
  }

  return (
    <Radio.Group
      name={name}
      defaultValue={defaultValue}
      onChange={(newValue) => {
        const option = options.find((option) => option[0] === newValue);
        if (option) {
          const optionValue = option[1];
          const propertyName = 'value' + capitalize(optionValue.type);
          onChangeAnswer({ [propertyName]: optionValue.value });
        }
      }}
    >
      {options.map(([optionName, optionValue]) => (
        <Radio
          key={optionName}
          id={optionName}
          value={optionName}
          label={
            <ResourcePropertyDisplay
              property={valueElementDefinition}
              propertyType={optionValue.type as PropertyType}
              value={optionValue.value}
            />
          }
        />
      ))}
    </Radio.Group>
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

export function isQuestionEnabled(
  item: QuestionnaireItem,
  answers: Record<string, QuestionnaireResponseItemAnswer>
): boolean {
  if (!item.enableWhen) {
    return true;
  }
  const enableBehavior = item.enableBehavior || 'any';
  for (const enableWhen of item.enableWhen) {
    const expectedAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireItemEnableWhen',
        value: enableWhen,
      },
      'answer[x]'
    );
    const actualAnswer = getTypedPropertyValue(
      {
        type: 'QuestionnaireResponseItemAnswer',
        value: answers[enableWhen.question as string],
      },
      'value[x]'
    );
    const match = deepEquals(expectedAnswer, actualAnswer);
    if (enableBehavior === 'any' && match) {
      return true;
    }
    if (enableBehavior === 'all' && !match) {
      return false;
    }
  }
  if (enableBehavior === 'any') {
    return false;
  } else {
    return true;
  }
}

import { Checkbox, Group, MultiSelect, NativeSelect, Radio, Textarea, TextInput } from '@mantine/core';
import {
  capitalize,
  deepEquals,
  formatCoding,
  getElementDefinition,
  getTypedPropertyValue,
  stringify,
  TypedValue,
} from '@medplum/core';
import {
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemInitial,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import React, { ChangeEvent } from 'react';
import { AttachmentInput } from '../../AttachmentInput/AttachmentInput';
import { CheckboxFormSection } from '../../CheckboxFormSection/CheckboxFormSection';
import { CodingInput } from '../../CodingInput/CodingInput';
import { DateTimeInput } from '../../DateTimeInput/DateTimeInput';
import { QuantityInput } from '../../QuantityInput/QuantityInput';
import { ReferenceInput } from '../../ReferenceInput/ReferenceInput';
import { ResourcePropertyDisplay } from '../../ResourcePropertyDisplay/ResourcePropertyDisplay';
import {
  getNewMultiSelectValues,
  getQuestionnaireItemReferenceTargetTypes,
  QuestionnaireItemType,
} from '../../utils/questionnaire';

export interface QuestionnaireFormItemProps {
  item: QuestionnaireItem;
  index: number;
  allResponses: QuestionnaireResponseItem[];
  currentResponseItems?: QuestionnaireResponseItem[];
  groupSequence?: number;
  onChange: (newResponseItem: QuestionnaireResponseItem) => void;
}

export function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
  const item = props.item;
  const index = props.index;

  function onChangeAnswer(
    newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[],
    repeatedIndex?: number
  ): void {
    const number = repeatedIndex ?? 0;
    const responses = props.currentResponseItems?.filter((r) => r.linkId === item.linkId) ?? [];

    let updatedAnswers: QuestionnaireResponseItemAnswer[];
    if (Array.isArray(newResponseAnswer)) {
      // It's a multi-select case, so use the array directly.
      updatedAnswers = newResponseAnswer;
    } else {
      // It's a single answer case.
      updatedAnswers = updateAnswerArray(responses[0]?.answer ?? [], number, newResponseAnswer);
    }
    props.onChange({
      id: responses[0].id,
      linkId: item.linkId,
      text: item.text,
      answer: updatedAnswers,
    });
  }

  const type = item.type as QuestionnaireItemType;
  if (!type) {
    return null;
  }

  const name = item.linkId;
  if (!name) {
    return null;
  }

  const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;
  const defaultValue =
    getCurrentAnswer(props.allResponses, item, props.index, props.groupSequence) ??
    getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value');

  switch (type) {
    case QuestionnaireItemType.boolean:
      return (
        <CheckboxFormSection key={props.item.linkId} title={props.item.text} htmlFor={props.item.linkId}>
          <Checkbox
            id={props.item.linkId}
            name={props.item.linkId}
            defaultChecked={defaultValue?.value}
            onChange={(e) => onChangeAnswer({ valueBoolean: e.currentTarget.checked }, index)}
          />
        </CheckboxFormSection>
      );
    case QuestionnaireItemType.decimal:
      return (
        <TextInput
          type="number"
          step="any"
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueDecimal: e.currentTarget.valueAsNumber }, index)}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueInteger: e.currentTarget.valueAsNumber }, index)}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue }, index)}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <TextInput
          type="time"
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return (
        <TextInput
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={name}
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value }, index)}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <Group py={4}>
          <AttachmentInput
            name={name}
            defaultValue={defaultValue?.value}
            onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue }, index)}
          />
        </Group>
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={name}
          targetTypes={getQuestionnaireItemReferenceTargetTypes(item)}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue }, index)}
        />
      );
    case QuestionnaireItemType.quantity:
      return (
        <QuantityInput
          name={name}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue }, index)}
          disableWheel
        />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item)) {
        return (
          <QuestionnaireChoiceDropDownInput
            name={name}
            item={item}
            initial={initial}
            allResponses={props.allResponses}
            index={index}
            groupSequence={props.groupSequence}
            onChangeAnswer={(e) => onChangeAnswer(e, index)}
          />
        );
      } else {
        return (
          <QuestionnaireChoiceSetInput
            name={name}
            item={item}
            initial={initial}
            allResponses={props.allResponses}
            onChangeAnswer={(e) => onChangeAnswer(e, index)}
          />
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
  allResponses: QuestionnaireResponseItem[];
  index?: number;
  groupSequence?: number;
  onChangeAnswer: (newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[]) => void;
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

  const defaultValue =
    getCurrentAnswer(props.allResponses, item, props.index, props.groupSequence) ??
    getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value');

  if (item.repeats) {
    const { propertyName, data } = formatSelectData(props.item);
    const currentAnswer = getCurrentMultiSelectAnswer(props.allResponses, item, props.groupSequence);

    return (
      <MultiSelect
        data={data}
        placeholder="Select items"
        searchable
        defaultValue={currentAnswer || [typedValueToString(initialValue)]}
        onChange={(selected) => {
          const values = getNewMultiSelectValues(selected, propertyName, item);
          props.onChangeAnswer(values);
        }}
      />
    );
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
      defaultValue={(formatCoding(defaultValue?.value) || defaultValue?.value) ?? typedValueToString(initialValue)}
      data={data}
    />
  );
}

function QuestionnaireChoiceSetInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer, allResponses } = props;
  if (item.answerValueSet) {
    return (
      <CodingInput
        name={name}
        binding={item.answerValueSet}
        onChange={(code) => onChangeAnswer({ valueCoding: code })}
      />
    );
  }
  return (
    <QuestionnaireChoiceRadioInput
      name={name}
      item={item}
      initial={initial}
      allResponses={allResponses}
      onChangeAnswer={onChangeAnswer}
    />
  );
}

function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer } = props;
  const valueElementDefinition = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
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

  const defaultAnswer = getCurrentAnswer(props.allResponses, item, props.index, props.groupSequence);
  const answerLinkId = getCurrentRadioAnswer(options, defaultAnswer);

  return (
    <Radio.Group
      name={name}
      value={answerLinkId ?? defaultValue}
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
          py={4}
          label={
            <ResourcePropertyDisplay
              property={valueElementDefinition}
              propertyType={optionValue.type}
              value={optionValue.value}
            />
          }
        />
      ))}
    </Radio.Group>
  );
}

function updateAnswerArray(
  answers: QuestionnaireResponseItemAnswer[],
  index: number,
  newResponseAnswer: QuestionnaireResponseItemAnswer
): QuestionnaireResponseItemAnswer[] {
  if (index < answers.length) {
    answers[index] = newResponseAnswer;
    return answers;
  } else {
    for (let i = answers.length; i < index; i++) {
      answers.push({});
    }
    answers.push(newResponseAnswer);
    return answers;
  }
}

function isDropDownChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
  );
}

interface MultiSelect {
  value: any;
  label: any;
}

interface FormattedData {
  propertyName: string;
  data: MultiSelect[];
}

function formatSelectData(item: QuestionnaireItem): FormattedData {
  if (item.answerOption?.length === 0) {
    return { propertyName: '', data: [] };
  }
  const option = (item.answerOption as QuestionnaireItemAnswerOption[])[0];
  const optionValue = getTypedPropertyValue(
    { type: 'QuestionnaireItemAnswerOption', value: option },
    'value'
  ) as TypedValue;
  const propertyName = 'value' + capitalize(optionValue.type);

  const data = (item.answerOption ?? []).map((a) => ({
    value: getValueAndLabel(a, propertyName),
    label: getValueAndLabel(a, propertyName),
  }));
  return { propertyName, data };
}

function getValueAndLabel(option: QuestionnaireItemAnswerOption, propertyName: string): string | undefined {
  return formatCoding(option.valueCoding) || option[propertyName as keyof QuestionnaireItemAnswerOption]?.toString();
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

function getItemsByLinkId(allResponses: QuestionnaireResponseItem[], linkId: string): QuestionnaireResponseItem[] {
  let result: QuestionnaireResponseItem[] = [];

  for (const item of allResponses) {
    // If the linkId matches, add it to the result array
    if (item.linkId === linkId) {
      result.push(item);
    }

    // If the current item has nested items, search them too
    if (item.item) {
      result = result.concat(getItemsByLinkId(item.item, linkId));
    }
  }
  return result;
}

function getItemValue(answer: QuestionnaireResponseItemAnswer): TypedValue {
  const itemValue = getTypedPropertyValue({ type: 'QuestionnaireItemAnswer', value: answer }, 'value') as TypedValue;
  return itemValue;
}

function getCurrentAnswer(
  allResponses: QuestionnaireResponseItem[],
  item: QuestionnaireItem,
  index: number = 0,
  groupSequence: number = 0
): TypedValue {
  const results = getItemsByLinkId(allResponses, item.linkId ?? '');
  const selectedItem = results[groupSequence]?.answer;
  return getItemValue(selectedItem?.[index] ?? {});
}

function getCurrentMultiSelectAnswer(
  allResponses: QuestionnaireResponseItem[],
  item: QuestionnaireItem,
  groupSequence: number = 0
): string[] {
  const results = getItemsByLinkId(allResponses, item.linkId ?? '');
  const selectedItem = results[groupSequence]?.answer;
  if (!selectedItem) {
    return [];
  }
  const typedValues = selectedItem.map((a) => getItemValue(a));
  return typedValues.map((type) => formatCoding(type?.value) || type?.value);
}

function getCurrentRadioAnswer(options: [string, TypedValue][], defaultAnswer: TypedValue): string | undefined {
  return options.find((option) => deepEquals(option[1].value, defaultAnswer?.value))?.[0];
}

import { Checkbox, ComboboxItem, Group, MultiSelect, NativeSelect, Radio, Textarea, TextInput, Text } from '@mantine/core';
import {
  capitalize,
  deepEquals,
  formatCoding,
  getElementDefinition,
  HTTP_HL7_ORG,
  stringify,
  TypedValue,
  typedValueToString,
} from '@medplum/core';
import {
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemInitial,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { ChangeEvent, useContext } from 'react';
import { AttachmentInput } from '../../AttachmentInput/AttachmentInput';
import { CheckboxFormSection } from '../../CheckboxFormSection/CheckboxFormSection';
import { CodingInput } from '../../CodingInput/CodingInput';
import { DateTimeInput } from '../../DateTimeInput/DateTimeInput';
import { QuantityInput } from '../../QuantityInput/QuantityInput';
import { ReferenceInput } from '../../ReferenceInput/ReferenceInput';
import { ResourcePropertyDisplay } from '../../ResourcePropertyDisplay/ResourcePropertyDisplay';
import {
  getItemAnswerOptionValue,
  getItemInitialValue,
  getNewMultiSelectValues,
  getQuestionnaireItemReferenceFilter,
  getQuestionnaireItemReferenceTargetTypes,
  QuestionnaireItemType,
} from '../../utils/questionnaire';
import { QuestionnaireFormContext } from '../QuestionnaireForm.context';

export interface QuestionnaireFormItemProps {
  readonly item: QuestionnaireItem;
  readonly index: number;
  readonly required?: boolean;
  readonly response: QuestionnaireResponseItem;
  readonly onChange: (newResponseItem: QuestionnaireResponseItem) => void;
}

export function QuestionnaireFormItem(props: QuestionnaireFormItemProps): JSX.Element | null {
  const context = useContext(QuestionnaireFormContext);
  const item = props.item;
  const response = props.response;

  function onChangeAnswer(
    newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[]
  ): void {
    let updatedAnswers: QuestionnaireResponseItemAnswer[];
    if (Array.isArray(newResponseAnswer)) {
      // It's a multi-select case, so use the array directly.
      updatedAnswers = newResponseAnswer;
    } else if (props.index >= (props.response?.answer?.length ?? 0)) {
      // if adding a new answer
      updatedAnswers = (props.response?.answer ?? []).concat([newResponseAnswer]);
    } else {
      // if updating an existing answer
      const newAnswers = (props.response?.answer ?? []).map((a, idx) =>
        idx === props.index ? newResponseAnswer : a
      ) as QuestionnaireResponseItemAnswer[];
      updatedAnswers = newAnswers ?? [];
    }
    props.onChange({
      id: response?.id,
      linkId: response?.linkId,
      text: item.text,
      answer: updatedAnswers,
    });
  }

  const type = item.type;
  if (!type) {
    return null;
  }

  const name = item.linkId;
  if (!name) {
    return null;
  }

  const initial = item.initial && item.initial.length > 0 ? item.initial[0] : undefined;
  const defaultValue = getCurrentAnswer(response, props.index) ?? getItemInitialValue(initial);


  const validationError = response.extension?.find(
    (ext) => ext.url === `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-validationError`
  );

  const renderValidationError = (): JSX.Element | null => {
    if (validationError?.valueString) {
      return (
        <Text c="red" size="lg" mt={4}>
          {validationError.valueString}
        </Text>
      );
    }
    return null;
  };


  let formComponent: JSX.Element | null = null;

  switch (type) {
    case QuestionnaireItemType.display:
      formComponent = <p key={props.item.linkId}>{props.item.text}</p>;
      break;
    case QuestionnaireItemType.boolean:
      formComponent = (
        <CheckboxFormSection key={props.item.linkId} title={props.item.text} htmlFor={props.item.linkId}>
          <Checkbox
            id={props.item.linkId}
            name={props.item.linkId}
            defaultChecked={defaultValue?.value}
            onChange={(e) => onChangeAnswer({ valueBoolean: e.currentTarget.checked })}
          />
        </CheckboxFormSection>
      );
      break;
    case QuestionnaireItemType.decimal:
      formComponent = (
        <TextInput
          type="number"
          step="any"
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueDecimal: e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber })}
        />
      );
      break;
    case QuestionnaireItemType.integer:
      formComponent = (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueInteger:e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber })}
        />
      );
      break;
    case QuestionnaireItemType.date:
      formComponent = (
        <TextInput
          type="date"
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value })}
        />
      );
      break;
    case QuestionnaireItemType.dateTime:
      formComponent = (
        <DateTimeInput
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue })}
        />
      );
      break;
    case QuestionnaireItemType.time:
      formComponent = (
        <TextInput
          type="time"
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value })}
        />
      );
      break;
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      formComponent = (
        <TextInput
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => {
            const value = e.currentTarget.value;
            onChangeAnswer({ valueString: value === '' ? undefined : value });
          }}
        />
      );
      break;
    case QuestionnaireItemType.text:
      formComponent = (
        <Textarea
          id={name}
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => {
            const value = e.currentTarget.value;
            onChangeAnswer({ valueString: value === '' ? undefined : value });
          }}
        />
      );
      break;
    case QuestionnaireItemType.attachment:
      formComponent = (
        <Group py={4}>
          <AttachmentInput
            path=""
            name={name}
            defaultValue={defaultValue?.value}
            onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue })}
          />
        </Group>
      );
      break;
    case QuestionnaireItemType.reference:
      formComponent = (
        <ReferenceInput
          name={name}
          required={props.required ?? item.required}
          targetTypes={getQuestionnaireItemReferenceTargetTypes(item)}
          searchCriteria={getQuestionnaireItemReferenceFilter(item, context.subject, context.encounter)}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue })}
        />
      );
      break;
    case QuestionnaireItemType.quantity:
      formComponent = (
        <QuantityInput
          path=""
          name={name}
          required={props.required ?? item.required}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue })}
          disableWheel
        />
      );
      break;
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item) && !item.answerValueSet) {
        formComponent = (
          <QuestionnaireChoiceDropDownInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      } else if (isMultiSelectChoice(item) && !item.answerValueSet) {
        formComponent = (
          <QuestionnaireMultiSelectInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      } else {
        formComponent = (
          <QuestionnaireChoiceSetInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      }
      break;
    default:
      return null;
  }


  if (type === QuestionnaireItemType.display) {
    return formComponent;
  }

  return (
    <>
      {formComponent}
      {renderValidationError()}
    </>
  );
}


interface QuestionnaireChoiceInputProps {
  readonly name: string;
  readonly item: QuestionnaireItem;
  readonly initial: QuestionnaireItemInitial | undefined;
  readonly response: QuestionnaireResponseItem;
  readonly onChangeAnswer: (
    newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[]
  ) => void;
}

function QuestionnaireChoiceDropDownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, response } = props;

  if (!item.answerOption?.length) {
    return <NoAnswerDisplay />;
  }

  const initialValue = getItemInitialValue(initial);

  const data = [''];

  for (const option of item.answerOption) {
    const optionValue = getItemAnswerOptionValue(option);
    data.push(typedValueToString(optionValue) as string);
  }

  const defaultValue = getCurrentAnswer(response) ?? initialValue;

  if (item.repeats) {
    const { propertyName, data } = formatSelectData(props.item);
    const currentAnswer = getCurrentMultiSelectAnswer(response);

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
        const optionValue = getItemAnswerOptionValue(option);
        const propertyName = 'value' + capitalize(optionValue.type);
        props.onChangeAnswer({ [propertyName]: optionValue.value });
      }}
      defaultValue={formatCoding(defaultValue?.value) || defaultValue?.value}
      data={data}
    />
  );
}

function QuestionnaireMultiSelectInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { item, initial, response } = props;

  if (!item.answerOption?.length) {
    return <NoAnswerDisplay />;
  }

  const initialValue = getItemInitialValue(initial);
  const { propertyName, data } = formatSelectData(props.item);
  const currentAnswer = getCurrentMultiSelectAnswer(response);

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

function QuestionnaireChoiceSetInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer, response } = props;

  if (!item.answerOption?.length && !item.answerValueSet) {
    return <NoAnswerDisplay />;
  }

  if (item.answerValueSet) {
    return (
      <CodingInput
        path=""
        name={name}
        binding={item.answerValueSet}
        response={response}
        onChange={(code) => onChangeAnswer({ valueCoding: code })}
        creatable={item.type === QuestionnaireItemType.openChoice}
      />
    );
  }
  return (
    <QuestionnaireChoiceRadioInput
      name={response?.id ?? name}
      item={item}
      initial={initial}
      response={response}
      onChangeAnswer={onChangeAnswer}
    />
  );
}

function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer, response } = props;
  const valueElementDefinition = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
  const initialValue = getItemInitialValue(initial);

  const options: [string, TypedValue][] = [];
  let defaultValue = undefined;
  if (item.answerOption) {
    for (let i = 0; i < item.answerOption.length; i++) {
      const option = item.answerOption[i];
      const optionName = `${name}-option-${i}`;
      const optionValue = getItemAnswerOptionValue(option);

      if (!optionValue?.value) {
        continue;
      }

      if (initialValue && stringify(optionValue) === stringify(initialValue)) {
        defaultValue = optionName;
      }
      options.push([optionName, optionValue]);
    }
  }

  const defaultAnswer = getCurrentAnswer(response);
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

function NoAnswerDisplay(): JSX.Element {
  return <TextInput disabled placeholder="No Answers Defined" />;
}

function getCurrentAnswer(response: QuestionnaireResponseItem, index: number = 0): TypedValue {
  const results = response.answer;
  return getItemAnswerOptionValue(results?.[index] ?? {});
}

function getCurrentMultiSelectAnswer(response: QuestionnaireResponseItem): string[] {
  const results = response.answer;
  if (!results) {
    return [];
  }
  const typedValues = results.map((a) => getItemAnswerOptionValue(a));
  return typedValues.map((type) => formatCoding(type?.value) || type?.value);
}

function getCurrentRadioAnswer(options: [string, TypedValue][], defaultAnswer: TypedValue): string | undefined {
  return options.find((option) => deepEquals(option[1].value, defaultAnswer?.value))?.[0];
}

function isDropDownChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
  );
}

function isMultiSelectChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === HTTP_HL7_ORG + '/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'multi-select'
  );
}

interface FormattedData {
  readonly propertyName: string;
  readonly data: ComboboxItem[];
}

function formatSelectData(item: QuestionnaireItem): FormattedData {
  if (item.answerOption?.length === 0) {
    return { propertyName: '', data: [] };
  }
  const option = (item.answerOption as QuestionnaireItemAnswerOption[])[0];
  const optionValue = getItemAnswerOptionValue(option);
  const propertyName = 'value' + capitalize(optionValue.type);

  const data = (item.answerOption ?? []).map((answerOption) => {
    const answerOptionValue = getItemAnswerOptionValue(answerOption);
    const answerOptionValueStr = typedValueToString(answerOptionValue);
    return {
      value: answerOptionValueStr,
      label: answerOptionValueStr,
    };
  });
  return { propertyName, data };
}

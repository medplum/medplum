import {
  Checkbox,
  ComboboxItem,
  Group,
  MultiSelect,
  NativeSelect,
  Radio,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  capitalize,
  deepEquals,
  formatCoding,
  getElementDefinition,
  getExtension,
  HTTP_HL7_ORG,
  stringify,
  TypedValue,
  typedValueToString,
} from '@medplum/core';
import {
  Coding,
  QuestionnaireItem,
  QuestionnaireItemAnswerOption,
  QuestionnaireItemInitial,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  ValueSet,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ChangeEvent, JSX, useContext, useEffect, useState } from 'react';
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
  const validationError = getExtension(
    response,
    `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-validationError`
  );

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
          onChange={(e) =>
            onChangeAnswer({ valueDecimal: e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber })
          }
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
          onChange={(e) =>
            onChangeAnswer({ valueInteger: e.currentTarget.value === '' ? undefined : e.currentTarget.valueAsNumber })
          }
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
      if (isCheckboxChoice(item)) {
        formComponent = (
          <QuestionnaireCheckboxInput
            name={response?.id ?? name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={onChangeAnswer}
          />
        );
      } else if (isDropdownChoice(item) || (item.answerValueSet && !isRadiobuttonChoice(item))) {
        // defaults answervalueset items to dropdown and everything else to radio button
        formComponent = (
          <QuestionnaireDropdownInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      } else {
        formComponent = (
          <QuestionnaireRadiobuttonInput
            name={response?.id ?? name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={onChangeAnswer}
          />
        );
      }
      break;
    default:
      return null;
  }

  return (
    <>
      {formComponent}
      {validationError?.valueString && (
        <Text c="red" size="lg" mt={4}>
          {validationError.valueString}
        </Text>
      )}
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

function QuestionnaireDropdownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer, response } = props;

  if (!item.answerOption?.length && !item.answerValueSet) {
    return <NoAnswerDisplay />;
  }

  const initialValue = getItemInitialValue(initial);
  const defaultValue = getCurrentAnswer(response) ?? initialValue;
  const currentAnswer = getCurrentMultiSelectAnswer(response);
  const isMultiSelect = item.repeats || isMultiSelectChoice(item);

  if (item.answerValueSet) {
    return (
      <CodingInput
        path=""
        name={name}
        binding={item.answerValueSet}
        response={response}
        onChange={(codes: Coding[]) => {
          if (isMultiSelect) {
            onChangeAnswer(codes.map((code: Coding) => ({ valueCoding: code })));
          } else {
            onChangeAnswer({ valueCoding: codes[0] });
          }
        }}
        creatable={item.type === QuestionnaireItemType.openChoice}
        maxValues={isMultiSelect ? undefined : 1}
      />
    );
  }

  if (isMultiSelect) {
    const { propertyName, data } = formatSelectData(item);
    return (
      <MultiSelect
        data={data}
        placeholder="Select items"
        searchable
        defaultValue={currentAnswer || [typedValueToString(initialValue)]}
        onChange={(selected) => {
          const values = getNewMultiSelectValues(selected, propertyName, item);
          onChangeAnswer(values);
        }}
      />
    );
  } else {
    const data = [''];
    if (item.answerOption) {
      for (const option of item.answerOption) {
        const optionValue = getItemAnswerOptionValue(option);
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
            onChangeAnswer({});
            return;
          }
          const option = (item.answerOption as QuestionnaireItemAnswerOption[])[index - 1];
          const optionValue = getItemAnswerOptionValue(option);
          const propertyName = 'value' + capitalize(optionValue.type);
          onChangeAnswer({ [propertyName]: optionValue.value });
        }}
        defaultValue={formatCoding(defaultValue?.value) || defaultValue?.value}
        data={data}
      />
    );
  }
}

function getValueSetOptions(
  valueSetUrl: string | undefined,
  medplum: ReturnType<typeof useMedplum>
): Promise<ValueSetExpansionContains[]> {
  if (!valueSetUrl) {
    return Promise.resolve([]);
  }

  return medplum
    .valueSetExpand({
      url: valueSetUrl,
      count: 50, // Limit to 50 items for performance
    })
    .then((valueSet: ValueSet) => valueSet.expansion?.contains ?? []);
}

function getOptionsFromValueSet(valueSetOptions: ValueSetExpansionContains[], name: string): [string, TypedValue][] {
  return valueSetOptions.map((option, i) => {
    const optionName = `${name}-valueset-${i}`;
    const optionValue = {
      type: 'Coding',
      value: {
        system: option.system,
        code: option.code,
        display: option.display,
      },
    };
    return [optionName, optionValue];
  });
}

function QuestionnaireRadiobuttonInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, initial, onChangeAnswer, response } = props;
  const valueElementDefinition = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
  const initialValue = getItemInitialValue(initial);
  const medplum = useMedplum();

  const [valueSetOptions, setValueSetOptions] = useState<ValueSetExpansionContains[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadValueSet(): Promise<void> {
      if (!item.answerValueSet) {
        return;
      }

      setIsLoading(true);
      try {
        const options = await getValueSetOptions(item.answerValueSet, medplum);
        if (mounted) {
          setValueSetOptions(options);
        }
      } catch (err) {
        console.error('Error loading value set:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadValueSet().catch(console.error);

    return () => {
      mounted = false;
    };
  }, [item.answerValueSet, medplum]);

  const options: [string, TypedValue][] = [];
  let defaultValue = undefined;

  if (item.answerValueSet) {
    options.push(...getOptionsFromValueSet(valueSetOptions, name));
  } else if (item.answerOption) {
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

  if (isLoading) {
    return <Text>Loading options...</Text>;
  }

  if (options.length === 0) {
    return <NoAnswerDisplay />;
  }

  const limitedOptions = options.slice(0, 30);

  return (
    <>
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
        {limitedOptions.map(([optionName, optionValue]) => (
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
      {options.length > 30 && (
        <Text size="sm" c="dimmed" mt="xs">
          Showing first 30 of {options.length} options
        </Text>
      )}
    </>
  );
}

function QuestionnaireCheckboxInput(props: QuestionnaireChoiceInputProps): JSX.Element {
  const { name, item, onChangeAnswer, response } = props;
  const valueElementDefinition = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
  const currentAnswers = getCurrentMultiSelectAnswer(response);
  const medplum = useMedplum();

  const [valueSetOptions, setValueSetOptions] = useState<ValueSetExpansionContains[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadValueSet(): Promise<void> {
      if (!item.answerValueSet) {
        return;
      }

      setIsLoading(true);
      try {
        const options = await getValueSetOptions(item.answerValueSet, medplum);
        if (mounted) {
          setValueSetOptions(options);
        }
      } catch (err) {
        console.error('Error loading value set:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadValueSet().catch(console.error);

    return () => {
      mounted = false;
    };
  }, [item.answerValueSet, medplum]);

  const options: [string, TypedValue][] = [];

  if (item.answerValueSet) {
    options.push(...getOptionsFromValueSet(valueSetOptions, name));
  } else if (item.answerOption) {
    for (let i = 0; i < item.answerOption.length && i < 50; i++) {
      const option = item.answerOption[i];
      const optionName = `${name}-option-${i}`;
      const optionValue = getItemAnswerOptionValue(option);

      if (!optionValue?.value) {
        continue;
      }

      options.push([optionName, optionValue]);
    }
  }

  if (isLoading) {
    return <Text>Loading options...</Text>;
  }

  if (options.length === 0) {
    return <NoAnswerDisplay />;
  }

  const limitedOptions = options.slice(0, 30);

  return (
    <Group style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {limitedOptions.map(([optionName, optionValue]) => {
        const isChecked = item.answerValueSet
          ? response.answer?.some((answer) => deepEquals(answer.valueCoding, optionValue.value))
          : currentAnswers?.includes(typedValueToString(optionValue));

        return (
          <Checkbox
            key={optionName}
            id={optionName}
            label={
              <ResourcePropertyDisplay
                property={valueElementDefinition}
                propertyType={optionValue.type}
                value={optionValue.value}
              />
            }
            checked={isChecked}
            onChange={(event) => {
              const selected = event.currentTarget.checked;
              if (item.answerValueSet) {
                const currentCodings = (response.answer?.map((a) => a.valueCoding) || []).filter(
                  (c): c is Coding => c !== undefined
                );
                let newCodings: Coding[];
                if (selected) {
                  newCodings = [...currentCodings, optionValue.value as Coding];
                } else {
                  newCodings = currentCodings.filter((c) => !deepEquals(c, optionValue.value));
                }
                onChangeAnswer(newCodings.map((coding) => ({ valueCoding: coding })));
              } else {
                const currentValues = currentAnswers || [];
                let newValues: string[];
                if (selected) {
                  newValues = [...currentValues, typedValueToString(optionValue)];
                } else {
                  newValues = currentValues.filter((v) => v !== typedValueToString(optionValue));
                }
                const values = getNewMultiSelectValues(newValues, 'value' + capitalize(optionValue.type), item);
                onChangeAnswer(values);
              }
            }}
          />
        );
      })}
      {options.length > 30 && (
        <Text size="sm" c="dimmed">
          Showing first 30 of {options.length} options
        </Text>
      )}
    </Group>
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

function isDropdownChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
  );
}

function isCheckboxChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === HTTP_HL7_ORG + '/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'check-box'
  );
}

function isRadiobuttonChoice(item: QuestionnaireItem): boolean {
  return !!item.extension?.some(
    (e) =>
      e.url === HTTP_HL7_ORG + '/fhir/StructureDefinition/questionnaire-itemControl' &&
      e.valueCodeableConcept?.coding?.[0]?.code === 'radio-button'
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

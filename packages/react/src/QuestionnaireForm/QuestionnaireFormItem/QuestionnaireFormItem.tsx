import { Checkbox, Group, Stack, Textarea, TextInput, Title, TitleOrder } from '@mantine/core';
import { Quantity, QuestionnaireItem, QuestionnaireResponseItemAnswerValue, Reference } from '@medplum/fhirtypes';
import { ChangeEvent, Fragment, PropsWithChildren, useContext } from 'react';
import { AttachmentInput } from '../../AttachmentInput/AttachmentInput';
import { ArrayAddButton } from '../../buttons/ArrayAddButton';
import { ArrayRemoveButton } from '../../buttons/ArrayRemoveButton';
import { CheckboxFormSection } from '../../CheckboxFormSection/CheckboxFormSection';
import { DateTimeInput } from '../../DateTimeInput/DateTimeInput';
import { FormSection } from '../../FormSection/FormSection';
import { QuantityInput } from '../../QuantityInput/QuantityInput';
import { ReferenceInput } from '../../ReferenceInput/ReferenceInput';
import {
  getQuestionnaireItemReferenceFilter,
  getQuestionnaireItemReferenceTargetTypes,
  QuestionnaireItemType,
} from '../../utils/questionnaire';
import { QuestionnaireItemState } from '../forEachItem';
import { QuestionnaireFormContext, UseQuestionnaireFormReturn } from '../useQuestionnaireForm';

export interface QuestionnaireFormItemProps {
  readonly item: QuestionnaireItem;
  readonly itemState: QuestionnaireItemState<QuestionnaireItem>;
}

export function QuestionnaireFormItem(props: PropsWithChildren<QuestionnaireFormItemProps>): JSX.Element | null {
  const formContext = useContext(QuestionnaireFormContext);
  const { item, children } = props;

  if (!formContext) {
    return null;
  }

  const type = item.type;
  if (!type) {
    return null;
  }

  const linkId = item.linkId;
  if (!linkId) {
    return null;
  }

  if (item.type === QuestionnaireItemType.display) {
    return <p key={linkId}>{item.text}</p>;
  }

  if (item.type === QuestionnaireItemType.group) {
    return (
      <div>
        <Title order={3 as TitleOrder} mb="md" key={item.linkId}>
          {item.text}
        </Title>
        <Stack>{children}</Stack>
      </div>
    );
  }

  const values = formContext.values[linkId];
  const isRepeatable = item.repeats === true;

  const repeatCount = isRepeatable ? (values as QuestionnaireResponseItemAnswerValue[]).length : 1;
  const ItemWrapper = isRepeatable ? Stack : Fragment;
  const AnswerWrapper = isRepeatable ? Group : Fragment;

  return (
    <FormSection title={item.text} htmlFor={linkId} withAsterisk={item.required}>
      <ItemWrapper>
        {[...Array(repeatCount)].map((_, index) => (
          <AnswerWrapper key={`${linkId}-${index}`}>
            {getInputForItem(item, formContext)}
            {/* Add a '-' button if the item is repeatable */}
            {isRepeatable && !item.readOnly && (
              <ArrayRemoveButton
                propertyDisplayName={item.text || ''}
                testId={`remove-${linkId}-${index}`}
                onClick={() => formContext.removeRepeatedAnswer(linkId, index)}
              />
            )}
          </AnswerWrapper>
        ))}
        {/* Add a '+' button if the question is repeatable */}
        {isRepeatable && !item.readOnly && (
          <Group wrap="nowrap" justify="flex-start">
            <ArrayAddButton
              propertyDisplayName={item.text || ''}
              onClick={() => formContext.addRepeatedAnswer(linkId)}
              testId={`add-${linkId}`}
            />
          </Group>
        )}
        {children && <Stack>{children}</Stack>}
      </ItemWrapper>
    </FormSection>
  );
}

function getInputForItem(
  item: QuestionnaireItem,
  context: UseQuestionnaireFormReturn,
  index?: number
): JSX.Element | null {
  let id = item.linkId ?? '';
  if (item.repeats) {
    id += `-${index}`;
  }
  id += '-input';

  const inputProps = context.getInputProps(item, {
    type: item.type === QuestionnaireItemType.boolean ? 'checkbox' : 'input',
    index,
  });

  switch (item.type) {
    case QuestionnaireItemType.boolean:
      return (
        <CheckboxFormSection key={id} title={item.text} htmlFor={item.linkId}>
          <Checkbox id={id} name={item.linkId} {...inputProps} />
        </CheckboxFormSection>
      );
    case QuestionnaireItemType.decimal:
      return <TextInput type="number" step="any" id={id} name={id} {...inputProps} />;
    case QuestionnaireItemType.integer:
      return <TextInput type="number" step={1} id={id} name={id} {...inputProps} />;
    case QuestionnaireItemType.date:
      return <TextInput type="date" id={id} name={id} {...inputProps} />;
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={id}
          {...{
            ...inputProps,
            onChange: (value: string) => {
              inputProps.onChange({ target: { value } } as ChangeEvent<HTMLInputElement>);
            },
          }}
        />
      );
    case QuestionnaireItemType.time:
      return <TextInput type="time" id={id} name={id} {...inputProps} />;
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return <TextInput id={id} name={id} {...inputProps} />;
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={id}
          name={id}
          {...{
            ...inputProps,
            onChange: (event) =>
              inputProps.onChange({ target: { value: event.target.value } } as ChangeEvent<HTMLInputElement>),
          }}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <Group py={4}>
          <AttachmentInput
            path=""
            name={id}
            {...{
              ...inputProps,
              onChange: (newValue) => {
                inputProps.onChange({
                  target: {
                    value: newValue,
                  },
                });
              },
            }}
          />
        </Group>
      );
    case QuestionnaireItemType.reference:
      inputProps.onChange = (newValue: Reference) => inputProps.onChange({ target: { value: newValue } });
      return (
        <ReferenceInput
          name={id}
          required={item.required}
          targetTypes={getQuestionnaireItemReferenceTargetTypes(item)}
          searchCriteria={getQuestionnaireItemReferenceFilter(item, context.subject, context.encounter)}
          {...inputProps}
        />
      );
    case QuestionnaireItemType.quantity:
      inputProps.onChange = (newValue: Quantity) => inputProps.onChange({ target: { value: newValue } });
      return <QuantityInput path="" name={id} required={item.required} {...inputProps} disableWheel />;
    // case QuestionnaireItemType.choice:
    // case QuestionnaireItemType.openChoice:
    //   if (isDropDownChoice(item) && !item.answerValueSet) {
    //     return (
    //       <QuestionnaireChoiceDropDownInput
    //         name={name}
    //         item={item}
    //         initial={initial}
    //         response={response}
    //         onChangeAnswer={(e) => onChangeAnswer(e)}
    //       />
    //     );
    //   } else {
    //     return (
    //       <QuestionnaireChoiceSetInput
    //         name={name}
    //         item={item}
    //         initial={initial}
    //         response={response}
    //         onChangeAnswer={(e) => onChangeAnswer(e)}
    //       />
    //     );
    //   }
    default:
      console.warn('Unsupported Questionnaire item type: ' + item.type);
      return null;
  }
}
// interface QuestionnaireChoiceInputProps {
//   readonly name: string;
//   readonly item: QuestionnaireItem;
//   readonly initial: QuestionnaireItemInitial | undefined;
//   readonly response: QuestionnaireResponseItem;
//   readonly onChangeAnswer: (
//     newResponseAnswer: QuestionnaireResponseItemAnswer | QuestionnaireResponseItemAnswer[]
//   ) => void;
// }

// function QuestionnaireChoiceDropDownInput(props: QuestionnaireChoiceInputProps): JSX.Element {
//   const { name, item, initial, response } = props;

//   if (!item.answerOption?.length) {
//     return <NoAnswerDisplay />;
//   }

//   const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
//     | TypedValue
//     | undefined;

//   const data = [''];

//   for (const option of item.answerOption) {
//     const optionValue = getTypedPropertyValue(
//       { type: 'QuestionnaireItemAnswerOption', value: option },
//       'value'
//     ) as TypedValue;
//     data.push(typedValueToString(optionValue) as string);
//   }

//   const defaultValue = getCurrentAnswer(response) ?? initialValue;

//   if (item.repeats) {
//     const { propertyName, data } = formatSelectData(props.item);
//     const currentAnswer = getCurrentMultiSelectAnswer(response);

//     return (
//       <MultiSelect
//         data={data}
//         placeholder="Select items"
//         searchable
//         defaultValue={currentAnswer || [typedValueToString(initialValue)]}
//         onChange={(selected) => {
//           const values = getNewMultiSelectValues(selected, propertyName, item);
//           props.onChangeAnswer(values);
//         }}
//       />
//     );
//   }

//   return (
//     <NativeSelect
//       id={name}
//       name={name}
//       onChange={(e: ChangeEvent<HTMLSelectElement>) => {
//         const index = e.currentTarget.selectedIndex;
//         if (index === 0) {
//           props.onChangeAnswer({});
//           return;
//         }
//         const option = (item.answerOption as QuestionnaireItemAnswerOption[])[index - 1];
//         const optionValue = getTypedPropertyValue(
//           { type: 'QuestionnaireItemAnswerOption', value: option },
//           'value'
//         ) as TypedValue;
//         const propertyName = 'value' + capitalize(optionValue.type);
//         props.onChangeAnswer({ [propertyName]: optionValue.value });
//       }}
//       defaultValue={formatCoding(defaultValue?.value) || defaultValue?.value}
//       data={data}
//     />
//   );
// }

// function QuestionnaireChoiceSetInput(props: QuestionnaireChoiceInputProps): JSX.Element {
//   const { name, item, initial, onChangeAnswer, response } = props;

//   if (!item.answerOption?.length && !item.answerValueSet) {
//     return <NoAnswerDisplay />;
//   }

//   if (item.answerValueSet) {
//     return (
//       <CodingInput
//         path=""
//         name={name}
//         binding={item.answerValueSet}
//         onChange={(code) => onChangeAnswer({ valueCoding: code })}
//         creatable={item.type === QuestionnaireItemType.openChoice}
//       />
//     );
//   }
//   return (
//     <QuestionnaireChoiceRadioInput
//       name={response?.id ?? name}
//       item={item}
//       initial={initial}
//       response={response}
//       onChangeAnswer={onChangeAnswer}
//     />
//   );
// }

// function QuestionnaireChoiceRadioInput(props: QuestionnaireChoiceInputProps): JSX.Element {
//   const { name, item, initial, onChangeAnswer, response } = props;
//   const valueElementDefinition = getElementDefinition('QuestionnaireItemAnswerOption', 'value[x]');
//   const initialValue = getTypedPropertyValue({ type: 'QuestionnaireItemInitial', value: initial }, 'value') as
//     | TypedValue
//     | undefined;

//   const options: [string, TypedValue][] = [];
//   let defaultValue = undefined;
//   if (item.answerOption) {
//     for (let i = 0; i < item.answerOption.length; i++) {
//       const option = item.answerOption[i];
//       const optionName = `${name}-option-${i}`;
//       const optionValue = getTypedPropertyValue(
//         { type: 'QuestionnaireItemAnswerOption', value: option },
//         'value'
//       ) as TypedValue;

//       if (!optionValue?.value) {
//         continue;
//       }

//       if (initialValue && stringify(optionValue) === stringify(initialValue)) {
//         defaultValue = optionName;
//       }
//       options.push([optionName, optionValue]);
//     }
//   }

//   const defaultAnswer = getCurrentAnswer(response);
//   const answerLinkId = getCurrentRadioAnswer(options, defaultAnswer);

//   return (
//     <Radio.Group
//       name={name}
//       value={answerLinkId ?? defaultValue}
//       onChange={(newValue) => {
//         const option = options.find((option) => option[0] === newValue);
//         if (option) {
//           const optionValue = option[1];
//           const propertyName = 'value' + capitalize(optionValue.type);
//           onChangeAnswer({ [propertyName]: optionValue.value });
//         }
//       }}
//     >
//       {options.map(([optionName, optionValue]) => (
//         <Radio
//           key={optionName}
//           id={optionName}
//           value={optionName}
//           py={4}
//           label={
//             <ResourcePropertyDisplay
//               property={valueElementDefinition}
//               propertyType={optionValue.type}
//               value={optionValue.value}
//             />
//           }
//         />
//       ))}
//     </Radio.Group>
//   );
// }

// function NoAnswerDisplay(): JSX.Element {
//   return <TextInput disabled placeholder="No Answers Defined" />;
// }

// function getItemValue(answer: QuestionnaireResponseItemAnswer): TypedValue {
//   const itemValue = getTypedPropertyValue({ type: 'QuestionnaireItemAnswer', value: answer }, 'value') as TypedValue;
//   return itemValue;
// }

// function getCurrentAnswer(response: QuestionnaireResponseItem, index: number = 0): TypedValue {
//   const results = response.answer;
//   return getItemValue(results?.[index] ?? {});
// }

// function getCurrentMultiSelectAnswer(response: QuestionnaireResponseItem): string[] {
//   const results = response.answer;
//   if (!results) {
//     return [];
//   }
//   const typedValues = results.map((a) => getItemValue(a));
//   return typedValues.map((type) => formatCoding(type?.value) || type?.value);
// }

// function getCurrentRadioAnswer(options: [string, TypedValue][], defaultAnswer: TypedValue): string | undefined {
//   return options.find((option) => deepEquals(option[1].value, defaultAnswer?.value))?.[0];
// }

// function typedValueToString(typedValue: TypedValue | undefined): string | undefined {
//   if (!typedValue) {
//     return undefined;
//   }
//   if (typedValue.type === 'CodeableConcept') {
//     return formatCodeableConcept(typedValue.value);
//   }
//   if (typedValue.type === 'Coding') {
//     return formatCoding(typedValue.value);
//   }
//   if (typedValue.type === 'Reference') {
//     return formatReferenceString(typedValue);
//   }
//   return typedValue.value.toString();
// }

// function isDropDownChoice(item: QuestionnaireItem): boolean {
//   return !!item.extension?.some(
//     (e) =>
//       e.url === 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl' &&
//       e.valueCodeableConcept?.coding?.[0]?.code === 'drop-down'
//   );
// }

// interface MultiSelect {
//   readonly value: any;
//   readonly label: any;
// }

// interface FormattedData {
//   readonly propertyName: string;
//   readonly data: MultiSelect[];
// }

// function formatSelectData(item: QuestionnaireItem): FormattedData {
//   if (item.answerOption?.length === 0) {
//     return { propertyName: '', data: [] };
//   }
//   const option = (item.answerOption as QuestionnaireItemAnswerOption[])[0];
//   const optionValue = getTypedPropertyValue(
//     { type: 'QuestionnaireItemAnswerOption', value: option },
//     'value'
//   ) as TypedValue;
//   const propertyName = 'value' + capitalize(optionValue.type);

//   const data = (item.answerOption ?? []).map((a) => ({
//     value: getValueAndLabel(a, propertyName),
//     label: getValueAndLabel(a, propertyName),
//   }));
//   return { propertyName, data };
// }

// function getValueAndLabel(option: QuestionnaireItemAnswerOption, propertyName: string): string | undefined {
//   return formatCoding(option.valueCoding) || option[propertyName as keyof QuestionnaireItemAnswerOption]?.toString();
// }

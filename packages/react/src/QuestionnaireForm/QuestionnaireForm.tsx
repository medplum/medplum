import { Button, Checkbox, TextInput } from '@mantine/core';
import { Encounter, Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { QuestionnaireItemType } from '../utils/questionnaire';
import { GetQuestionnaireItemInputProps, useQuestionnaireForm } from './useQuestionnaireForm';

export interface QuestionnaireFormProps {
  readonly questionnaire: Questionnaire | Reference<Questionnaire>;
  readonly subject?: Reference;
  readonly encounter?: Reference<Encounter>;
  readonly submitButtonText?: string;
  readonly initialResponse?: QuestionnaireResponse;
  readonly onSubmit: (response: QuestionnaireResponse) => void;
}

export function QuestionnaireForm(props: QuestionnaireFormProps): JSX.Element | null {
  const { getInputProps, handleSubmit, questionnaire } = useQuestionnaireForm(
    props.questionnaire,
    props.initialResponse
  );
  if (!questionnaire) {
    return null;
  }
  return (
    <form onSubmit={handleSubmit(props.onSubmit)}>
      {questionnaire.item?.map((item) => (
        <div key={item.linkId}>
          <TextInput label={item.text} required={item.required} {...getInputProps<'string'>(item)} />
        </div>
      ))}
      <Button type="submit">{props.submitButtonText ?? 'Submit'}</Button>
    </form>
  );
}

function getInputForItem(item: QuestionnaireItem, getInputProps: GetQuestionnaireItemInputProps): React.ReactNode {
  const linkId = item.linkId;
  const text = item.text;

  switch (item.type) {
    case QuestionnaireItemType.display:
      return <p {...getInputProps(item)}>{item.text}</p>;
    case 'boolean':
      return (
        <CheckboxFormSection key={linkId} title={text} htmlFor={linkId}>
          <Checkbox id={linkId} name={linkId} {...getInputProps(item, { type: 'checkbox' })} />
        </CheckboxFormSection>
      );
    case 'decimal':
      return (
        <TextInput
          type="number"
          step="any"
          id={linkId}
          name={linkId}
          required={item.required}
          {...getInputProps<'decimal'>(item)}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput
          type="number"
          step={1}
          id={name}
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueInteger: e.currentTarget.valueAsNumber })}
        />
      );
    case QuestionnaireItemType.date:
      return (
        <TextInput
          type="date"
          id={name}
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueDate: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.dateTime:
      return (
        <DateTimeInput
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(newValue: string) => onChangeAnswer({ valueDateTime: newValue })}
        />
      );
    case QuestionnaireItemType.time:
      return (
        <TextInput
          type="time"
          id={name}
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueTime: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return (
        <TextInput
          id={name}
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.text:
      return (
        <Textarea
          id={name}
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(e) => onChangeAnswer({ valueString: e.currentTarget.value })}
        />
      );
    case QuestionnaireItemType.attachment:
      return (
        <Group py={4}>
          <AttachmentInput
            path=""
            name={name}
            defaultValue={defaultValue?.value}
            onChange={(newValue) => onChangeAnswer({ valueAttachment: newValue })}
          />
        </Group>
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={name}
          required={item.required}
          targetTypes={getQuestionnaireItemReferenceTargetTypes(item)}
          searchCriteria={getQuestionnaireItemReferenceFilter(item, context.subject, context.encounter)}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueReference: newValue })}
        />
      );
    case QuestionnaireItemType.quantity:
      return (
        <QuantityInput
          path=""
          name={name}
          required={item.required}
          defaultValue={defaultValue?.value}
          onChange={(newValue) => onChangeAnswer({ valueQuantity: newValue })}
          disableWheel
        />
      );
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item) && !item.answerValueSet) {
        return (
          <QuestionnaireChoiceDropDownInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      } else {
        return (
          <QuestionnaireChoiceSetInput
            name={name}
            item={item}
            initial={initial}
            response={response}
            onChangeAnswer={(e) => onChangeAnswer(e)}
          />
        );
      }
    default:
      return null;
  }
}

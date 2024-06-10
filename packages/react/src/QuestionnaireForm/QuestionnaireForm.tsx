import { Button, Checkbox, TextInput } from '@mantine/core';
import { Encounter, Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { CheckboxFormSection } from '../CheckboxFormSection/CheckboxFormSection';
import { QuantityInput } from '../QuantityInput/QuantityInput';
import { QuestionnaireItemType } from '../utils/questionnaire';
import { GetQuestionnaireItemInputProps, useQuestionnaireForm } from './useQuestionnaireForm';
import { DateTimeInput } from '../DateTimeInput/DateTimeInput';
import { AttachmentInput } from '../AttachmentInput/AttachmentInput';
import { ReferenceInput } from '../ReferenceInput/ReferenceInput';

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
    case 'display':
      return <p>{item.text}</p>;
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
          {...getInputProps(item)}
        />
      );
    case QuestionnaireItemType.integer:
      return (
        <TextInput type="number" step={1} id={linkId} name={linkId} required={item.required} {...getInputProps(item)} />
      );
    case QuestionnaireItemType.date:
      return <TextInput type="date" id={linkId} name={linkId} required={item.required} {...getInputProps(item)} />;
    case QuestionnaireItemType.dateTime:
      return <DateTimeInput name={linkId} required={item.required} {...getInputProps(item)} />;
    case QuestionnaireItemType.time:
      return <TextInput type="time" id={linkId} name={linkId} required={item.required} {...getInputProps(item)} />;
    case QuestionnaireItemType.string:
    case QuestionnaireItemType.url:
      return <TextInput id={linkId} name={linkId} required={item.required} {...getInputProps(item)} />;
    case QuestionnaireItemType.text:
      return <Textarea id={linkId} name={linkId} required={item.required} {...getInputProps(item)} />;
    case QuestionnaireItemType.attachment:
      return (
        <Group py={4}>
          <AttachmentInput path="" name={linkId} {...getInputProps(item)} />
        </Group>
      );
    case QuestionnaireItemType.reference:
      return (
        <ReferenceInput
          name={linkId}
          required={item.required}
          targetTypes={getQuestionnaireItemReferenceTargetTypes(item)}
          searchCriteria={getQuestionnaireItemReferenceFilter(item, context.subject, context.encounter)}
          {...getInputProps(item)}
        />
      );
    case QuestionnaireItemType.quantity:
      return <QuantityInput path="" name={linkId} required={item.required} {...getInputProps(item)} disableWheel />;
    case QuestionnaireItemType.choice:
    case QuestionnaireItemType.openChoice:
      if (isDropDownChoice(item) && !item.answerValueSet) {
        return (
          <QuestionnaireChoiceDropDownInput name={linkId} item={item} response={response} {...getInputProps(item)} />
        );
      } else {
        return (
          <QuestionnaireChoiceSetInput
            name={linkId}
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

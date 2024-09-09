import { Anchor } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useState } from 'react';
import { FormSection } from '../../FormSection/FormSection';
import { QuestionnaireItemType } from '../../utils/questionnaire';
import { QuestionnaireFormItem } from './QuestionnaireFormItem';

interface QuestionnaireRepeatableItemProps {
  readonly item: QuestionnaireItem;
  readonly response?: QuestionnaireResponseItem;
  readonly checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  readonly onChange: (items: QuestionnaireResponseItem[]) => void;
}

export function QuestionnaireRepeatableItem(props: QuestionnaireRepeatableItemProps): JSX.Element | null {
  const { item, response, onChange } = props;
  const [number, setNumber] = useState(getNumberOfRepeats(item, response ?? { linkId: item.linkId }));
  if (!props.checkForQuestionEnabled(item)) {
    return null;
  }

  if (!response) {
    return null;
  }

  if (item.type === QuestionnaireItemType.display) {
    return <p key={item.linkId}>{item.text}</p>;
  }

  const showAddButton =
    item?.repeats && item.type !== QuestionnaireItemType.choice && item.type !== QuestionnaireItemType.openChoice;

  // Styling reason to avoid duplicate text
  if (item.type === QuestionnaireItemType.boolean) {
    return (
      <QuestionnaireFormItem
        key={item.linkId}
        item={item}
        response={response}
        onChange={(r) => onChange([r])}
        index={0}
      />
    );
  }

  return (
    <FormSection
      key={props.item.linkId}
      htmlFor={props.item.linkId}
      title={props.item.text}
      withAsterisk={props.item.required}
    >
      {[...Array(number)].map((_, index) => (
        <QuestionnaireFormItem
          key={`${item.linkId}-${index}`}
          item={item}
          response={response}
          onChange={(r) => onChange([r])}
          index={index}
        />
      ))}
      {showAddButton && <Anchor onClick={() => setNumber((n) => n + 1)}>Add Item</Anchor>}
    </FormSection>
  );
}

function getNumberOfRepeats(item: QuestionnaireItem, response: QuestionnaireResponseItem): number {
  if (item.type === QuestionnaireItemType.choice || item.type === QuestionnaireItemType.openChoice) {
    return 1;
  }
  const answers = response.answer;
  return answers?.length ? answers.length : 1;
}

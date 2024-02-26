import { Anchor, Stack, Title } from '@mantine/core';
import { QuestionnaireItem, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useState } from 'react';
import { QuestionnaireItemType, buildInitialResponseItem } from '../../utils/questionnaire';
import { QuestionnaireRepeatableItem } from '../QuestionnaireFormItem/QuestionnaireRepeatableItem';

interface QuestionnaireRepeatableGroupProps {
  readonly item: QuestionnaireItem;
  readonly response: QuestionnaireResponseItem[];
  readonly checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  readonly onChange: (responses: QuestionnaireResponseItem[]) => void;
}

export function QuestionnaireRepeatedGroup(props: QuestionnaireRepeatableGroupProps): JSX.Element | null {
  const [responses, setResponses] = useState(props.response);

  if (responses.length === 0) {
    return null;
  }

  function handleRepeatableGroup(newResponseItems: QuestionnaireResponseItem[], index: number): void {
    const newResponses = responses.map((responses, idx) => (idx === index ? newResponseItems[0] : responses));
    setResponses(newResponses);
    props.onChange(newResponses);
  }

  function insertNewGroup(): void {
    const newResponse = buildInitialResponseItem(props.item);
    setResponses([...responses, newResponse]);
  }

  return (
    <>
      {responses.map((response, idx) => (
        <QuestionnaireGroup
          key={response.id}
          item={props.item}
          response={response}
          checkForQuestionEnabled={props.checkForQuestionEnabled}
          onChange={(r) => handleRepeatableGroup(r, idx)}
        />
      ))}
      {props.item.repeats && <Anchor onClick={insertNewGroup}>{`Add Group: ${props.item.text}`}</Anchor>}
    </>
  );
}

interface QuestionnaireGroupProps {
  readonly item: QuestionnaireItem;
  readonly response: QuestionnaireResponseItem;
  readonly checkForQuestionEnabled: (item: QuestionnaireItem) => boolean;
  readonly onChange: (response: QuestionnaireResponseItem[]) => void;
}

export function QuestionnaireGroup(props: QuestionnaireGroupProps): JSX.Element | null {
  const { response, checkForQuestionEnabled, onChange } = props;
  function onSetGroup(newResponseItem: QuestionnaireResponseItem[]): void {
    const newResponse = response.item?.map((current) => {
      const matchingItem = newResponseItem.find((newResponse) => newResponse.id === current.id);
      return matchingItem ?? current;
    });
    // This checks to see if there were any nested repeated groups that we need to add
    const mergedResponse = newResponse?.concat(newResponseItem.slice(1));
    const groupResponse = { ...response, item: mergedResponse };
    onChange([groupResponse]);
  }

  if (!props.checkForQuestionEnabled(props.item)) {
    return null;
  }

  return (
    <div key={props.item.linkId}>
      {props.item.text && (
        <Title order={3} mb="md">
          {props.item.text}
        </Title>
      )}
      <Stack>
        {props.item.item?.map((item) => {
          if (item.type === QuestionnaireItemType.group) {
            return item.repeats ? (
              <QuestionnaireRepeatedGroup
                key={item.linkId}
                item={item}
                response={response.item?.filter((i) => i.linkId === item.linkId) ?? []}
                checkForQuestionEnabled={checkForQuestionEnabled}
                onChange={onSetGroup}
              />
            ) : (
              <QuestionnaireGroup
                key={item.linkId}
                item={item}
                checkForQuestionEnabled={checkForQuestionEnabled}
                response={response.item?.find((i) => i.linkId === item.linkId) ?? { linkId: item.linkId }}
                onChange={onSetGroup}
              />
            );
          }
          return (
            <QuestionnaireRepeatableItem
              key={item.linkId}
              item={item}
              response={response.item?.find((i) => i.linkId === item.linkId)}
              onChange={onSetGroup}
              checkForQuestionEnabled={checkForQuestionEnabled}
            />
          );
        })}
      </Stack>
    </div>
  );
}

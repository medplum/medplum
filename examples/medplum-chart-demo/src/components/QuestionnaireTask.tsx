import { Anchor, Button, Collapse, Flex, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PropertyType, TypedValue, getTypedPropertyValue } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, QuestionnaireResponseItem, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, ResourcePropertyDisplay, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import React, { useState } from 'react';
import { TaskCellProps } from './TaskList';

export function QuestionnaireTask(props: TaskCellProps): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const questionnaire = props.resource as Questionnaire;
  const medplum = useMedplum();

  if (submitted) {
    return <IconCircleCheck color="#79d290" size={48} />;
  }

  async function handleSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    await medplum.createResource(questionnaireResponse);
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    setSubmitted(true);
  }
  return (questionnaire.item ?? []).length <= 2 ? (
    <QuestionnaireQuickAction
      task={props.task}
      questionnaire={questionnaire}
      setSubmitted={setSubmitted}
      handleSubmit={handleSubmit}
    />
  ) : (
    <QuestionnaireModal
      task={props.task}
      questionnaire={questionnaire}
      setSubmitted={setSubmitted}
      handleSubmit={handleSubmit}
    />
  );
}

function QuestionnaireModal(props: {
  task: Task;
  questionnaire: Questionnaire;
  setSubmitted: (submit: boolean) => void;
  handleSubmit: (questionnaireResponse: QuestionnaireResponse) => Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);

  function handleModalSubmit(questionnaireResponse: QuestionnaireResponse): void {
    props.handleSubmit(questionnaireResponse);
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Fill out {props.questionnaire.title}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} size="xl">
        <QuestionnaireForm questionnaire={props.questionnaire} onSubmit={handleModalSubmit} />
      </Modal>
    </>
  );
}

function QuestionnaireQuickAction(props: {
  task: Task;
  questionnaire: Questionnaire;
  setSubmitted: (submit: boolean) => void;
  handleSubmit: (questionnaireResponse: QuestionnaireResponse) => Promise<void>;
}): JSX.Element {
  return <QuestionnaireForm questionnaire={props.questionnaire} onSubmit={props.handleSubmit} />;
}

export function ResponseDisplay(props: TaskCellProps): JSX.Element {
  const resource = props.resource as QuestionnaireResponse;
  const items = resource.item ?? [];
  const [reviewed, setReviewed] = useState(false);
  const [opened, { toggle }] = useDisclosure(false);
  const medplum = useMedplum();

  async function handleClick(): Promise<void> {
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    setReviewed(true);
  }
  const visibleItems = items.slice(0, 3);
  const collapsedItems = items.slice(3, items.length);
  return (
    <>
      {visibleItems.map((item) => (
        <ItemRow item={item} />
      ))}
      <Collapse in={opened}>
        {collapsedItems.map((item) => (
          <ItemRow item={item} />
        ))}
      </Collapse>
      {collapsedItems.length > 0 && <Anchor onClick={toggle}>{opened ? 'Show less' : 'Show more'}</Anchor>}
      <Flex justify="right" mt={16}>
        {reviewed ? (
          <IconCircleCheck color="#79d290" size={48} />
        ) : (
          <Button mt={8} onClick={handleClick}>
            Ok
          </Button>
        )}
      </Flex>
    </>
  );
}

function ItemRow(props: { item: QuestionnaireResponseItem }): JSX.Element {
  const item = props.item;
  const itemValue = getTypedPropertyValue(
    { type: 'QuestionnaireItemAnswer', value: item?.answer?.[0] },
    'value'
  ) as TypedValue;
  const propertyName = itemValue.type;
  return (
    <Flex justify="space-between">
      <Text>{item.text}</Text>
      <ResourcePropertyDisplay value={itemValue.value} propertyType={propertyName as PropertyType} />
    </Flex>
  );
}

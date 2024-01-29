import { Anchor, Button, Collapse, Flex, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { TypedValue, getTypedPropertyValue } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, QuestionnaireResponseItem, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, ResourcePropertyDisplay, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
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
  readonly task: Task;
  readonly questionnaire: Questionnaire;
  readonly setSubmitted: (submit: boolean) => void;
  readonly handleSubmit: (questionnaireResponse: QuestionnaireResponse) => Promise<void>;
}): JSX.Element {
  const [open, setOpen] = useState(false);

  async function handleModalSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    await props.handleSubmit(questionnaireResponse);
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
  readonly task: Task;
  readonly questionnaire: Questionnaire;
  readonly setSubmitted: (submit: boolean) => void;
  readonly handleSubmit: (questionnaireResponse: QuestionnaireResponse) => Promise<void>;
}): JSX.Element {
  return <QuestionnaireForm questionnaire={props.questionnaire} onSubmit={props.handleSubmit} />;
}

export function ResponseDisplay(props: TaskCellProps): JSX.Element | null {
  const resource = props.resource as QuestionnaireResponse;
  const items = resource.item ?? [];
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [opened, { toggle }] = useDisclosure(false);
  const medplum = useMedplum();

  useEffect(() => {
    medplum
      .requestSchema('QuestionnaireResponse')
      .then(() => setSchemaLoaded(true))
      .catch(console.error);
  }, [medplum]);

  async function handleClick(): Promise<void> {
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    setReviewed(true);
  }

  const visibleItems = items.slice(0, 3);
  const collapsedItems = items.slice(3, items.length);

  if (!schemaLoaded) {
    return null;
  }

  return (
    <>
      {visibleItems.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
      <Collapse in={opened}>
        {collapsedItems.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </Collapse>
      {showCollapsibleButton(collapsedItems) && <Anchor onClick={toggle}>{opened ? 'Show less' : 'Show more'}</Anchor>}
      <Flex justify="right" mt={16}>
        {reviewed ? (
          <IconCircleCheck color="#79d290" size={48} />
        ) : (
          <Button mt={8} onClick={handleClick}>
            Complete Review
          </Button>
        )}
      </Flex>
    </>
  );
}

function ItemRow(props: { item: QuestionnaireResponseItem }): JSX.Element | null {
  const item = props.item;
  const itemValue = getTypedPropertyValue(
    { type: 'QuestionnaireResponseItemAnswer', value: item?.answer?.[0] },
    'value'
  ) as TypedValue;
  if (!itemValue) {
    return null;
  }
  const propertyName = itemValue.type;
  return (
    <Flex justify="space-between" mb={12}>
      <Text w="50%">{item.text}</Text>
      <Text ta="right">
        <ResourcePropertyDisplay value={itemValue.value} propertyType={propertyName} />
      </Text>
    </Flex>
  );
}

function showCollapsibleButton(items: QuestionnaireResponseItem[]): boolean {
  if (items.length === 0) {
    return false;
  }
  return items.some((item) => item.answer?.length);
}

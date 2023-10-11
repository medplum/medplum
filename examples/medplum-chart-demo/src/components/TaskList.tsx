import { Anchor, Box, Button, Card, Collapse, Divider, Flex, Group, Modal, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { PropertyType, TypedValue, formatDate, getTypedPropertyValue } from '@medplum/core';
import {
  CodeableConcept,
  DiagnosticReport,
  Questionnaire,
  QuestionnaireResponse,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import {
  CodeableConceptDisplay,
  DiagnosticReportDisplay,
  ErrorBoundary,
  QuestionnaireForm,
  ResourceName,
  ResourcePropertyDisplay,
  StatusBadge,
  Timeline,
  useMedplum,
  useResource,
} from '@medplum/react';
import {
  IconCircleCheck,
  IconFilePencil,
  IconListCheck,
  IconReportMedical,
  IconStethoscope,
  IconUserSquare,
} from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const focusIcons: Record<string, JSX.Element> = {
  Observation: <IconStethoscope />,
  MedicationRequest: <IconUserSquare />,
  Questionnaire: <IconFilePencil color="#D33E2C" size={24} />,
  QuestionnaireResponse: <IconListCheck color="#207EDF" size={24} />,
  DiagnosticReport: <IconReportMedical color="#4EB180" size={24} />,
};

export function TaskList(): JSX.Element | null {
  const { id } = useParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const medplum = useMedplum();
  const patient = useResource({ reference: `Patient/${id}` });
  useEffect(() => {
    medplum
      .searchResources(
        'Task',
        `patient=${id}&status:not=completed&status:not=failed&status:not=rejected&focus:missing=false`
      )
      .then((response) => {
        setTasks(response);
      })
      .catch(console.error);
  });

  if (!patient) {
    return null;
  }

  return (
    <Card sx={{ width: 700 }} withBorder p="sm" radius="md" mx="md" my="xl" shadow="xs">
      <Title>{`Required Action (${tasks.length})`}</Title>
      <Box>
        <Timeline>
          {tasks.map((task, idx) => (
            <React.Fragment key={idx}>
              <FocusTimeline key={task.id} task={task} />
              {idx !== tasks.length - 1 ? <Divider w="100%" /> : null}
            </React.Fragment>
          ))}
        </Timeline>
      </Box>
    </Card>
  );
}

function FocusTimeline(props: { task: Task }): JSX.Element | null {
  const task = props.task;

  const focused = useResource(task.focus);
  if (!focused) {
    return null;
  }
  return (
    <TaskItem key={task.id} profile={task.owner} resource={focused} task={task}>
      <Box pt="sm" px="xl" pb="xl">
        <ResourceFocus resource={focused} task={task} />
      </Box>
    </TaskItem>
  );
}

function ResourceFocus(props: { resource: Resource; task: Task }): JSX.Element {
  const resource = props.resource;
  const [submitted, setSubmitted] = useState(false);

  function renderResourceContent(resource: Resource): JSX.Element {
    switch (resource.resourceType) {
      case 'Questionnaire':
        return submitted ? (
          <IconCircleCheck color="#79d290" size={48} />
        ) : (resource.item ?? []).length <= 2 ? (
          <QuestionnaireQuickAction questionnaire={resource} task={props.task} setSubmitted={setSubmitted} />
        ) : (
          <QuestionnaireModal questionnaire={resource} task={props.task} setSubmitted={setSubmitted} />
        );
      case 'QuestionnaireResponse':
        return <ResponseDisplay task={props.task} resource={resource} />;
      case 'DiagnosticReport':
        return submitted ? (
          <IconCircleCheck color="#79d290" size={48} />
        ) : (
          <DiagnosticReportModal task={props.task} report={resource} setReviewed={setSubmitted} />
        );
      default:
        return <div />;
    }
  }

  if (!resource) {
    return <div />;
  }
  return <Box ml={16}>{renderResourceContent(resource)}</Box>;
}

function TaskItem(props: any): JSX.Element {
  const { task, resource, profile, padding } = props;
  const author = profile ?? resource.meta?.author;
  const dateTime = props.dateTime ?? resource.meta?.lastUpdated;
  console.log(resource);
  return (
    <>
      <Group position="apart" spacing={8} my="sm" align="flex-start">
        <Box mt={3}>{focusIcons[resource.resourceType]}</Box>
        <Box style={{ flex: 1 }}>
          <Flex justify="space-between">
            <Flex>
              <Text size="sm" ml={8}>
                <TaskTitle resource={resource} task={task} />
              </Text>
            </Flex>
            {'status' in props.resource && <StatusBadge status={task.status as string} />}
          </Flex>
          <Text size="xs" display="flex" ml={8}>
            <Text size="xs" color="dimmed">
              <ResourceName value={author} />
            </Text>
            <Text component="span" color="dimmed" mx={8}>
              &middot;
            </Text>
            <Text size="xs" color="dimmed" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipses' }}>
              {formatDate(dateTime)}
            </Text>
          </Text>
        </Box>
      </Group>
      <ErrorBoundary>
        {padding && <div style={{ padding: '0 16px 16px 16px' }}>{props.children}</div>}
        {!padding && <>{props.children}</>}
      </ErrorBoundary>
    </>
  );
}

function ResponseDisplay(props: { task: Task; resource: QuestionnaireResponse }): JSX.Element {
  const { resource } = props;
  const items = resource.item ?? [];
  const [reviewed, setReviewed] = useState(false);
  const [opened, { toggle }] = useDisclosure(false);
  const medplum = useMedplum();
  const handleClick = async () => {
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    setReviewed(true);
  };
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

function ItemRow(props: any): JSX.Element {
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

function DiagnosticReportModal(props: {
  task: Task;
  report: DiagnosticReport;
  setReviewed: (reviewed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const medplum = useMedplum();
  const handleClick = async () => {
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    props.setReviewed(true);
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} sx={{ color: '#4EB180', borderColor: '#4EB180' }}>
        Review {<CodeableConceptDisplay value={props.report.code} />}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} size="xl">
        <DiagnosticReportDisplay value={props.report} />
        <Flex justify={'flex-end'}>
          <Button mt={8} onClick={handleClick}>
            Ok
          </Button>
        </Flex>
      </Modal>
    </>
  );
}

function QuestionnaireModal(props: {
  task: Task;
  questionnaire: Questionnaire;
  setSubmitted: (submit: boolean) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const medplum = useMedplum();

  const handleSubmit = async (questionnaireResponse: QuestionnaireResponse) => {
    await medplum.createResource(questionnaireResponse);
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    props.setSubmitted(true);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Fill out {props.questionnaire.title}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} size="xl">
        <QuestionnaireForm questionnaire={props.questionnaire} onSubmit={handleSubmit} />
      </Modal>
    </>
  );
}

function QuestionnaireQuickAction(props: any): JSX.Element {
  const medplum = useMedplum();
  const handleSubmit = async (questionnaireResponse: QuestionnaireResponse) => {
    await medplum.createResource(questionnaireResponse);
    await medplum.updateResource<Task>({ ...props.task, status: 'completed' });
    props.setSubmitted(true);
  };

  return <QuestionnaireForm questionnaire={props.questionnaire} onSubmit={handleSubmit} />;
}

function TaskTitle(props: { resource: Resource; task: Task }): JSX.Element {
  const [title, setTitle] = useState<JSX.Element>();
  const medplum = useMedplum();

  useEffect(() => {
    const fetchQuestionnaireTitle = async () => {
      if (props.resource.resourceType === 'QuestionnaireResponse') {
        const questionnaireId = props.resource.questionnaire?.split('/')[1];
        const questionnaire = await medplum.readResource('Questionnaire', questionnaireId as string);
        setTitle(<>{questionnaire?.title} Response</>);
      }
    };

    if ('code' in props.resource && props.resource.code) {
      setTitle(<CodeableConceptDisplay value={props.resource.code as CodeableConcept} />);
    } else if (props.resource.resourceType === 'Questionnaire') {
      setTitle(<>{props.resource.title}</>);
    } else if (props.resource.resourceType === 'QuestionnaireResponse') {
      fetchQuestionnaireTitle();
    } else {
      setTitle(<>{props.task.code}</>);
    }
  }, [props.resource, props.task, medplum]);

  return title ?? <></>;
}

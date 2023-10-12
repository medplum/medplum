import { Box, Card, Divider, Flex, Group, Text, Title } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { CodeableConcept, Questionnaire, Reference, Resource, Task } from '@medplum/fhirtypes';
import {
  CodeableConceptDisplay,
  ErrorBoundary,
  ResourceName,
  StatusBadge,
  Timeline,
  useMedplum,
  useResource,
} from '@medplum/react';
import { IconFilePencil, IconListCheck, IconReportMedical } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QuestionnaireTask, ResponseDisplay } from './QuestionnaireTask';
import { DiagnosticReportModal } from './DiagnosticReportTask';

const focusIcons: Record<string, JSX.Element> = {
  Questionnaire: <IconFilePencil color="#D33E2C" size={24} />,
  QuestionnaireResponse: <IconListCheck color="#207EDF" size={24} />,
  DiagnosticReport: <IconReportMedical color="#4EB180" size={24} />,
};

export interface TaskCellProps {
  task: Task;
  resource: Resource;
}

interface TaskItemProps {
  task: Task;
  resource: Resource;
  profile?: Reference;
  children?: React.ReactNode;
}

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

function ResourceFocus(props: TaskCellProps): JSX.Element {
  const resource = props.resource;

  function renderResourceContent(resource: Resource): JSX.Element {
    switch (resource.resourceType) {
      case 'Questionnaire':
        return <QuestionnaireTask task={props.task} resource={props.resource as Questionnaire} />;
      case 'QuestionnaireResponse':
        return <ResponseDisplay task={props.task} resource={resource} />;
      case 'DiagnosticReport':
        return <DiagnosticReportModal task={props.task} resource={resource} />;
      default:
        return <div />;
    }
  }

  if (!resource) {
    return <div />;
  }
  return <Box ml={16}>{renderResourceContent(resource)}</Box>;
}

function TaskItem(props: TaskItemProps): JSX.Element {
  const { task, resource, profile } = props;
  const author = profile ?? resource.meta?.author;
  const dateTime = resource.meta?.lastUpdated;
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
        <>{props.children}</>
      </ErrorBoundary>
    </>
  );
}

function TaskTitle(props: TaskCellProps): JSX.Element {
  const [title, setTitle] = useState<JSX.Element>();
  const medplum = useMedplum();

  useEffect(() => {
    async function fetchQuestionnaireTitle(): Promise<void> {
      if (props.resource.resourceType === 'QuestionnaireResponse') {
        const questionnaireId = props.resource.questionnaire?.split('/')[1];
        const questionnaire = await medplum.readResource('Questionnaire', questionnaireId as string);
        setTitle(<>{questionnaire?.title} Response</>);
      }
    }

    if ('code' in props.resource && props.resource.code) {
      setTitle(<CodeableConceptDisplay value={props.resource.code as CodeableConcept} />);
    } else if (props.resource.resourceType === 'Questionnaire') {
      setTitle(<>{props.resource.title}</>);
    } else if (props.resource.resourceType === 'QuestionnaireResponse') {
      fetchQuestionnaireTitle().catch(console.error);
    } else {
      setTitle(<>{props.task.code}</>);
    }
  }, [props.resource, props.task, medplum]);

  return title ?? <></>;
}

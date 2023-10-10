import { Box, Card, Divider, Group, Text, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import { Resource, Task } from '@medplum/fhirtypes';
import {
  AttachmentDisplay,
  CodeableConceptDisplay,
  ErrorBoundary,
  MedplumLink,
  ResourceAvatar,
  ResourceName,
  StatusBadge,
  Timeline,
  useMedplum,
  useResource,
} from '@medplum/react';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

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
      });
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

function FocusTimeline(props: { task: Task }): JSX.Element | undefined {
  const task = props.task;

  const focused = useResource(task.focus);
  if (!focused) {
    return;
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
  function renderResourceContent(resource: Resource) {
    switch (resource.resourceType) {
      case 'Communication':
        if (resource.topic) {
          return <CodeableConceptDisplay value={resource.topic} />;
        }
        return resource.payload?.[0].contentString ? (
          <Text>{resource.payload?.[0].contentString}</Text>
        ) : (
          <AttachmentDisplay value={resource.payload?.[0].contentAttachment} />
        );
      case 'MedicationRequest':
        return <CodeableConceptDisplay value={resource.medicationCodeableConcept} />;
      case 'Questionnaire':
        return <Text>{resource.name}</Text>;
      case 'DiagnosticReport':
        return <CodeableConceptDisplay value={resource.code} />;
      default:
        return <div />;
    }
  }

  if (!resource) {
    return <div />;
  }
  return <MedplumLink to={props.task}>{renderResourceContent(resource)}</MedplumLink>;
}

function TaskItem(props: any): JSX.Element {
  const { task, resource, profile, padding } = props;
  const author = profile ?? resource.meta?.author;
  const dateTime = props.dateTime ?? resource.meta?.lastUpdated;

  return (
    <>
      <Group position="apart" spacing={8} my="sm">
        <ResourceAvatar value={author} link={true} size="md" />
        <Box style={{ flex: 1 }}>
          <Text size="sm">
            <ResourceName color="dark" weight={500} value={author} link={true} />
          </Text>
          {'status' in props.resource && (
            <Box mt={2} mb={2}>
              <StatusBadge status={task.status as string} />
            </Box>
          )}
          <Text size="xs" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipses' }}>
            <MedplumLink color="dimmed" to={props.task}>
              {formatDateTime(dateTime)}
            </MedplumLink>
            <Text component="span" color="dimmed" mx={8}>
              &middot;
            </Text>
            <MedplumLink
              color="dimmed"
              to={`/Task?_count=20&_fields=_lastUpdated,code,priority,assignment,owner,focus,period,note&_offset=0&_sort=-_lastUpdated&code=${task.code?.coding?.[0]?.code}`}
            >
              <CodeableConceptDisplay value={task.code} />
            </MedplumLink>
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

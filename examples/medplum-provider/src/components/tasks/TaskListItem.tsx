// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { ListItem, StatusBadge, useResource } from '@medplum/react';
import type { JSX } from 'react';

interface TaskListItemProps {
  task: Task;
  selectedTask: Task | undefined;
  getTaskUri: (task: Task) => string;
}

export function TaskListItem(props: TaskListItemProps): JSX.Element {
  const { task, selectedTask, getTaskUri } = props;
  const isSelected = selectedTask?.id === task.id;
  const patient = useResource(task.for);
  const owner = useResource(task.owner);
  const taskFrom = task?.authoredOn ? `from ${formatDate(task?.authoredOn)}` : '';
  const taskUrl = getTaskUri(task);

  return (
    <ListItem to={taskUrl} selected={isSelected}>
      <Stack gap={0} miw={0}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Text fw={700} truncate="end" flex={1} miw={0}>
            {task.code?.text ?? `Task ${taskFrom}`}
          </Text>
          <StatusBadge status={task.status} variant="light" />
        </Group>
        <Stack gap={0} c="dimmed">
          {task.restriction?.period && <Text>Due {formatDate(task.restriction?.period?.end)}</Text>}
          {patient?.resourceType === 'Patient' && <Text>For: {formatHumanName(patient.name?.[0])}</Text>}
          {owner?.resourceType === 'Practitioner' && (
            <Text size="sm">Assigned to {formatHumanName(owner.name?.[0])}</Text>
          )}
        </Stack>
      </Stack>
    </ListItem>
  );
}

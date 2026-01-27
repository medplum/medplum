// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { MedplumLink, StatusBadge, useResource } from '@medplum/react';
import type { HumanName, Task } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import classes from './TaskListItem.module.css';
import cx from 'clsx';

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
    <MedplumLink to={taskUrl} underline="never">
      <Group
        p="xs"
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0} flex={1}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={700} className={classes.content}>
              {task.code?.text ?? `Task ${taskFrom}`}
            </Text>
            <StatusBadge status={task.status} variant="light" />
          </Group>
          <Stack gap={0} c="dimmed">
            {task.restriction?.period && <Text fw={500}>Due {formatDate(task.restriction?.period?.end)}</Text>}
            {patient?.resourceType === 'Patient' && <Text>For: {formatHumanName(patient.name?.[0] as HumanName)}</Text>}
            {owner?.resourceType === 'Practitioner' && (
              <Text size="sm">Assigned to {formatHumanName(owner.name?.[0] as HumanName)}</Text>
            )}
          </Stack>
        </Stack>
      </Group>
    </MedplumLink>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName } from '@medplum/core';
import { HumanName, Task } from '@medplum/fhirtypes';
import { JSX } from 'react';
import classes from './TaskListItem.module.css';
import cx from 'clsx';
import { MedplumLink, useResource } from '@medplum/react';

interface TaskListItemProps {
  task: Task;
  selectedTask: Task | undefined;
}

export function TaskListItem(props: TaskListItemProps): JSX.Element {
  const { task, selectedTask } = props;
  const isSelected = selectedTask?.id === task.id;
  const patient = useResource(task.for);
  const owner = useResource(task.owner);

  return (
    <MedplumLink to={`/Task/${task.id}`} c="dark">
      <Group
        p="xs"
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0}>
          <Text fw={700} className={classes.content}>
            {task.code?.text ?? `Task from ${formatDate(task?.authoredOn)}`}
          </Text>
          {task.restriction?.period && <Text fw={500}>Due {formatDate(task.restriction?.period?.end)}</Text>}
          {patient?.resourceType === 'Patient' && <Text>For: {formatHumanName(patient.name?.[0] as HumanName)}</Text>}
          {owner?.resourceType === 'Practitioner' && (
            <Text size="sm">Assigned to {formatHumanName(owner.name?.[0] as HumanName)}</Text>
          )}
        </Stack>
      </Group>
    </MedplumLink>
  );
}

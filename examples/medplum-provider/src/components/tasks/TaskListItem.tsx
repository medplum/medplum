import { Group, Stack, Text } from '@mantine/core';
import { formatDate, formatHumanName, getDisplayString } from '@medplum/core';
import { HumanName, Patient, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { JSX } from 'react';
import classes from './TaskListItem.module.css';
import cx from 'clsx';
import { useResource } from '@medplum/react';

interface TaskListItemProps {
  task: Task;
  selectedTask: Task | undefined;
  onClick: () => void;
}

export function TaskListItem(props: TaskListItemProps): JSX.Element {
  const { task, selectedTask, onClick } = props;
  const isSelected = selectedTask?.id === task.id;
  const patient = useResource(task.for as Reference<Patient>);
  const owner = useResource(task.owner as Reference<Practitioner>);

  return (
    <Group
      p="xs"
      align="center"
      wrap="nowrap"
      className={cx(classes.contentContainer, {
        [classes.selected]: isSelected,
      })}
      onClick={onClick}
      
    >
      <Stack gap={0}>
        <Text fw={700} className={classes.content}>
          {getDisplayString(task)}
        </Text>
        {task.restriction?.period && (
          <Text fw={500}>
            Due {formatDate(task.restriction?.period?.end)}
          </Text>
        )}
        {patient && (
          <Text >
            For: {formatHumanName(patient.name?.[0] as HumanName)}
          </Text>
        )}
        {owner && (
          <Text size="sm" c="dimmed">
            Assigned to {formatHumanName(owner.name?.[0] as HumanName)}
          </Text>
        )}
      </Stack>
    </Group>
  );
}

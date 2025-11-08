// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Collapse, Group, Text, Badge, ActionIcon, Divider } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconUser, IconCalendar, IconFlag } from '@tabler/icons-react';
import type { Task } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { formatHumanName, formatDate } from '@medplum/core';
import { TaskProperties } from './TaskProperties';
import classes from './TaskListItemExpandable.module.css';
import type { JSX } from 'react';

interface TaskListItemExpandableProps {
  task: Task;
  isExpanded: boolean;
  onToggle: () => void;
  onTaskChange: (task: Task) => void;
}

export function TaskListItemExpandable({
  task,
  isExpanded,
  onToggle,
  onTaskChange,
}: TaskListItemExpandableProps): JSX.Element {
  const patient = useResource(task.for);
  const owner = useResource(task.owner);
  const dueDate = task.restriction?.period?.end;

  const getPriorityColor = (priority?: Task['priority']): string => {
    switch (priority) {
      case 'stat':
        return 'red';
      case 'urgent':
        return 'orange';
      case 'asap':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const getStatusColor = (status?: Task['status']): string => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in-progress':
        return 'blue';
      case 'cancelled':
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Box className={classes.container}>
      {/* Collapsed View (always visible) */}
      <Box
        className={`${classes.header} ${isExpanded ? classes.expanded : ''}`}
        onClick={onToggle}
      >
        <Group justify="space-between" wrap="nowrap" w="100%">
          <Group gap="md" style={{ flex: 1 }}>
            {/* Expand/Collapse Icon */}
            <ActionIcon variant="subtle" size="sm">
              {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>

            {/* Task Code/Title */}
            <Text fw={600} className={classes.taskTitle}>
              {task.code?.text ?? `Task from ${task.authoredOn ? formatDate(task.authoredOn) : 'unknown'}`}
            </Text>

            {/* Priority Badge */}
            {task.priority && (
              <Badge
                size="sm"
                color={getPriorityColor(task.priority)}
                leftSection={<IconFlag size={12} />}
              >
                {task.priority.toUpperCase()}
              </Badge>
            )}

            {/* Status Badge */}
            <Badge size="sm" color={getStatusColor(task.status)} variant="light">
              {task.status}
            </Badge>
          </Group>

          {/* Due Date */}
          {dueDate && (
            <Group gap="xs">
              <IconCalendar size={14} />
              <Text size="sm" c="dimmed">
                Due {formatDate(dueDate)}
              </Text>
            </Group>
          )}
        </Group>

        {/* Secondary Info Row */}
        <Group gap="lg" mt="xs" ml={40}>
          {patient?.resourceType === 'Patient' && (
            <Group gap="xs">
              <IconUser size={14} />
              <Text size="sm" c="dimmed">
                {formatHumanName(patient.name?.[0])}
              </Text>
            </Group>
          )}
          {owner?.resourceType === 'Practitioner' && (
            <Text size="sm" c="dimmed">
              Assigned to {formatHumanName(owner.name?.[0])}
            </Text>
          )}
        </Group>
      </Box>

      {/* Expanded Detail View */}
      <Collapse in={isExpanded}>
        <Box className={classes.details} p="md" bg="gray.0">
          <Divider mb="md" />
          <TaskProperties
            task={task}
            onTaskChange={onTaskChange}
            p={0}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

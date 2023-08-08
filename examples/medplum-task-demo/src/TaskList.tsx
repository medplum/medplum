import { Paper, Table, Text, Title } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import React from 'react';
import { TaskRow } from './TaskRow';
import { scoreTask } from './utils';

export interface TaskListProps {
  title: string;
  tasks: Task[];
  filter: (t: Task) => boolean;
  onChange(): void;
  withOwner?: boolean;
  withDueDate?: boolean;
  withLastUpdated?: boolean;
  withActions?: boolean;
}

export function TaskList(props: TaskListProps): JSX.Element {
  return (
    <Paper withBorder p={2}>
      <Title order={4} mb="xl">
        {props.title}
      </Title>
      <Table verticalSpacing={2} fontSize="xs" width="100%">
        <thead>
          <tr>
            <th>Code</th>
            {props.withOwner && <th>Owner</th>}
            {props.withDueDate && <th>Due</th>}
            <th>Status</th>
            {props.withLastUpdated && <th>Last Updated</th>}
            {props.withActions && <th />}
          </tr>
        </thead>
        <tbody>
          {props.tasks
            .filter(props.filter)
            .sort((a, b) => scoreTask(b) - scoreTask(a))
            .map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                withOwner={props.withOwner}
                withDueDate={props.withDueDate}
                withActions={props.withActions}
                withLastUpdated={props.withLastUpdated}
                onChange={props.onChange}
              />
            ))}
          {props.tasks.length === 0 && (
            <tr>
              <td colSpan={100} align="center">
                <Text size="xs" color="gray" fs="italic">
                  No tasks found.
                </Text>
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </Paper>
  );
}

import { Paper, Table, Text, Title } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
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
      <Table verticalSpacing={2} fz="xs" width="100%">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Code</Table.Th>
            {props.withOwner && <Table.Th>Owner</Table.Th>}
            {props.withDueDate && <Table.Th>Due</Table.Th>}
            <Table.Th>Status</Table.Th>
            {props.withLastUpdated && <Table.Th>Last Updated</Table.Th>}
            {props.withActions && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
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
            <Table.Tr>
              <Table.Td colSpan={100} align="center">
                <Text size="xs" color="gray" fs="italic">
                  No tasks found.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

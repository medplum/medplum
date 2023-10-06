import React from 'react';
import { CodeableConcept, Resource, Task } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import { Anchor, Box, Paper, Table, Text, Title } from '@mantine/core';
import { IconProgress, IconUrgent } from '@tabler/icons-react';

// export function TaskList(props: { tasks: Task[] }): JSX.Element | undefined {
//   const tasks = props.tasks;
//   return (
//     <Box w="30%" mt={80} ml={16}>
//       <Title mb={16} order={4}>
//         Requiring Action {tasks.length}
//       </Title>
//       {tasks.map((task) => (
//         <TaskCell key={task.id} task={task} />
//       ))}
//     </Box>
//   );
// }

export function TaskCell(props: { task: Task }): JSX.Element | undefined {
  const task = props.task;
  const focus = useResource(task.focus);
  const medplum = useMedplum();
  const date = new Date(task.lastModified as string).toDateString();

  const handleChange = async () => {
    console.log('Button clicked!');
    await medplum.updateResource({
      ...task,
      status: 'completed',
    });
  };

  return (
    <Box
      display="flex"
      p={10}
      style={{ justifyContent: 'space-between', border: '1px solid gray', borderRadius: 12, height: 100 }}
    >
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        <Text pr={8} mr={8} lineClamp={2} fz={'xs'}>{`${date}`}</Text>
        <Box display="flex" style={{ flexDirection: 'column', justifyContent: 'space-between' }}>
          <Box display="flex" style={{ justifyContent: 'space-between' }}>
            <Box display="flex">
              {isOlderThanAWeek(task.lastModified as string) ? (
                <IconUrgent width={25} color="red" />
              ) : (
                <IconProgress width={25} color="green" />
              )}
              <Text>{task.status}</Text>
            </Box>
          </Box>
          <FocusResource resource={focus as Resource & { category: CodeableConcept[]; code: CodeableConcept }} />
        </Box>
        <Anchor fz={'xs'} href="#" style={{ alignSelf: 'right' }} onClick={handleChange}>
          completed
        </Anchor>
      </Box>
    </Box>
  );
}

export function FocusResource(props: {
  resource: Resource & { category: CodeableConcept[]; code: CodeableConcept };
}): JSX.Element | undefined {
  return (
    <Box w={'100%'}>
      <Text fw={600}>{props.resource?.category?.[0]?.text}</Text>
      <Text w="50%" style={{ whiteSpace: 'nowrap' }}>
        {props.resource?.code?.text}
      </Text>
    </Box>
  );
}

function isOlderThanAWeek(dateString: string): boolean {
  const inputDate = new Date(dateString);
  const currentDate = new Date();

  const weekAgo = new Date(currentDate);
  weekAgo.setDate(currentDate.getDate() - 7);

  return inputDate < weekAgo;
}

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
              <></>
              // <TaskRow
              //   key={task.id}
              //   task={task}
              //   withOwner={props.withOwner}
              //   withDueDate={props.withDueDate}
              //   withActions={props.withActions}
              //   withLastUpdated={props.withLastUpdated}
              //   onChange={props.onChange}
              // />
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

/**
 * Calculates a score for a task.
 * Higher scores are more important.
 * @param task The task.
 * @returns The score.
 */
export function scoreTask(task: Task): number {
  let secondsRemaining = 24 * 3600; // Default time remaining is 24 hours
  if (task.restriction?.period?.end) {
    secondsRemaining = (new Date(task.restriction.period.end).getTime() - Date.now()) / 1000;
  }

  let priorityMultiplier = 1;
  if (task.priority) {
    priorityMultiplier =
      {
        routine: 1,
        urgent: 2,
        asap: 4,
        stat: 8,
      }[task.priority] || 1;
  }

  return Math.max(1, 24 * 3600 - secondsRemaining) * priorityMultiplier;
}

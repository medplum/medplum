import React from 'react';
import { CodeableConcept, Resource, Task } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { Anchor, Box, Text } from '@mantine/core';
import { RenderItem } from './Chart';
import { IconProgress, IconUrgent } from '@tabler/icons-react';

export function TaskList(props: { tasks: Task[] }): JSX.Element | undefined {
  const tasks = props.tasks;
  return (
    <Box w="30%">
      {tasks.map((task) => (
        <TaskCell key={task.id} task={task} />
      ))}
    </Box>
  );
}

export function TaskCell(props: { task: Task }): JSX.Element | undefined {
  const task = props.task;
  const focus = useResource(task.focus);
  const date = new Date(task.lastModified as string).toLocaleDateString();
  
  return (
    <Box w="75%">
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        <Text fz={'xs'}>{`${date}`}</Text>
        {isOlderThanAWeek(task.lastModified as string) ? <IconUrgent width={25} /> : <IconProgress width={25} />}
        <Box>
          <Text>{task.status}</Text>
          <FocusResource resource={focus as Resource & { category: CodeableConcept[]; code: CodeableConcept }} />
        </Box>
        <Anchor fz={'xs'} href="#">
          completed
        </Anchor>
      </Box>
    </Box>
  );
}

export function FocusResource(props: {
  resource: Resource & { category: CodeableConcept[]; code: CodeableConcept };
}): JSX.Element | undefined {
  const values = [props.resource?.category?.[0]?.text ?? '', props.resource?.code?.text ?? ''];
  return <RenderItem items={values} />;
}

function isOlderThanAWeek(dateString: string): boolean {
  const inputDate = new Date(dateString);
  const currentDate = new Date();

  const weekAgo = new Date(currentDate);
  weekAgo.setDate(currentDate.getDate() - 7);

  return inputDate < weekAgo;
}

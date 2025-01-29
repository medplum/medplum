import React from 'react';
import { Card, Stack, Box, Text } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { TaskStatusPanel } from './TaskStatusPanel';

interface SimpleTaskProps {
  task: Task;
}

export const SimpleTask = ({ task }: SimpleTaskProps): JSX.Element => {
  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs">
        <Box p="md">
          <Stack gap="xs">
            {task.code?.text && (
              <Text fw={500} size="lg">
                {task.code.text}
              </Text>
            )}
            <Text>{task.description}</Text>
          </Stack>
        </Box>
        <TaskStatusPanel task={task} />
      </Stack>
    </Card>
  );
};

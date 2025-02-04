import { Box, Stack, Text } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';

interface SimpleTaskProps {
  task: Task;
}

export const SimpleTask = ({ task }: SimpleTaskProps): JSX.Element => {
  return (
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
  );
};

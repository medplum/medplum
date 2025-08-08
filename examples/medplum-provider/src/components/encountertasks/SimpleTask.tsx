// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Stack, Text } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { JSX } from 'react';

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
        {task.focus?.reference?.startsWith('ServiceRequest/') && (
          <Button component="a" href={`/${task.focus.reference}`} target="_blank">
            View Service Request
          </Button>
        )}
      </Stack>
    </Box>
  );
};

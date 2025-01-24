import React from 'react';
import { Group, Stack, Text, Button, Menu, useMantineTheme } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';

interface TaskStatusPanelProps {
  task: Task;
  onSubmit?: () => void;
}

export const TaskStatusPanel = ({ task, onSubmit }: TaskStatusPanelProps): JSX.Element => {
  const theme = useMantineTheme();

  return (
    <Group
      justify="space-between"
      align="center"
      style={{
        height: 70,
        backgroundColor: task.status === 'completed' ? theme.colors.green[0] : theme.colors.gray[1],
      }}
      p="md"
    >
      <Stack gap={0}>
        <Text color="black">Current status</Text>
        <Text fw="bold" color="black">
          {task.status}
        </Text>
      </Stack>

      <Group gap={8}>
        <Button variant="transparent" color={theme.colors.blue[6]}>
          Task details
        </Button>
        <Menu>
          <Menu.Target>
            <Button onClick={onSubmit}>Edit task ▾</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item>Edit</Menu.Item>
            <Menu.Item>Delete</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
};

import React from 'react';
import { Group, Stack, Text, Button, Menu, useMantineTheme } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { useNavigate } from 'react-router-dom';

interface TaskStatusPanelProps {
  task: Task;
}

export const TaskStatusPanel = ({ task }: TaskStatusPanelProps): JSX.Element => {
  const navigate = useNavigate();
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
        <Button variant="transparent" 
        color={theme.colors.blue[6]}
           onClick={() => {
            console.log('Task details', task.id);
            navigate(`Task/${task.id}`);
          }}
        >
          Task details
        </Button>
        <Menu>
          <Menu.Target>
            <Button>Edit task ▾</Button>
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
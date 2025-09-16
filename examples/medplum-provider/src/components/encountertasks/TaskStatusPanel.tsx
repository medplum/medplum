// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Flex, Menu, Text, Box, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { IconChevronDown, IconPencil, IconCheck } from '@tabler/icons-react';
import { JSX } from 'react';

interface TaskStatusPanelProps {
  task: Task;
  onActionButtonClicked: () => void;
  onChangeStatus: (status: Task[`status`]) => void;
}

export const TaskStatusPanel = ({ task, onActionButtonClicked, onChangeStatus }: TaskStatusPanelProps): JSX.Element => {
  const badgeColor = getBadgeColor(task.status);

  return (
    <Box p="md" style={{ borderTop: '1px solid #eee', margin: 0 }}>
      <Flex justify="space-between" align="center" w="100%" m={0}>
        <Flex align="center" gap={8}>
          <Text>Task Status:</Text>
          <Menu position="bottom-start">
            <Menu.Target>
              <Badge
                variant="light"
                color={badgeColor}
                size="lg"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0 }}
                rightSection={<IconChevronDown size={16} />}
              >
                {task.status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
              </Badge>
            </Menu.Target>
            <Menu.Dropdown style={{ width: 140 }}>
              {statuses.map((status) => (
                <Menu.Item
                  key={status.value}
                  rightSection={
                    task.status === status.value ? (
                      <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                        <IconCheck size={16} color="gray" />
                      </div>
                    ) : null
                  }
                  onClick={() => onChangeStatus(status.value as Task['status'])}
                >
                  {status.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Flex>
        <Tooltip label="Edit Task" openDelay={500}>
          <ActionIcon onClick={onActionButtonClicked} color="gray" variant="subtle" aria-label="Edit Task" size="lg">
            <IconPencil size={20} />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Box>
  );
};

const statuses = [
  { value: 'completed', label: 'Completed' },
  { value: 'ready', label: 'Ready' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

const getBadgeColor = (status: Task['status']): string => {
  const colors = { completed: 'green', cancelled: 'red' };
  return colors[status as keyof typeof colors] ?? 'blue';
};

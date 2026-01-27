// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu, ActionIcon, Text, Flex } from '@mantine/core';
import {
  IconFilter,
  IconChevronRight,
  IconUserCheck,
  IconStethoscope,
  IconCheck,
  IconExclamationCircle,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import type { Patient, Task, CodeableConcept } from '@medplum/fhirtypes';
import { TaskFilterType, TASK_STATUSES, TASK_PRIORITIES } from './TaskFilterMenu.utils';
import type { TaskFilterValue } from './TaskFilterMenu.utils';

interface TaskFilterMenuProps {
  statuses?: Task['status'][];
  owner?: Task['owner'];
  performerType?: CodeableConcept;
  priorities?: Task['priority'][];
  patient?: Patient;
  performerTypes?: CodeableConcept[];
  onFilterChange?: (filterType: TaskFilterType, value: TaskFilterValue) => void;
}

export function TaskFilterMenu(props: TaskFilterMenuProps): JSX.Element {
  const { statuses = [], priorities = [], performerType, performerTypes, onFilterChange } = props;

  const uniquePerformerTypes =
    performerTypes?.filter((performerType, index, self) => {
      const identifier = performerType.coding?.[0]?.code || performerType.text;
      return identifier && self.findIndex((pt) => (pt.coding?.[0]?.code || pt.text) === identifier) === index;
    }) || [];

  return (
    <Menu shadow="md" width={200} position="bottom-start">
      <Menu.Target>
        <ActionIcon variant="light" color="gray" size={32} radius="xl" aria-label="Filter tasks">
          <IconFilter size={16} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Filters</Menu.Label>

        {/* Status Submenu */}
        <Menu.Item>
          <Menu trigger="hover" openDelay={100} closeDelay={400} position="right-start" offset={5}>
            <Menu.Target>
              <Flex align="center" justify="space-between" w="100%">
                <Flex align="center" gap="xs">
                  <IconStethoscope size={16} />
                  <Text size="sm">Status</Text>
                </Flex>
                <IconChevronRight size={16} />
              </Flex>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Task Status</Menu.Label>
              {TASK_STATUSES.map((taskStatus) => (
                <Menu.Item
                  key={taskStatus}
                  onClick={() => onFilterChange?.(TaskFilterType.STATUS, taskStatus)}
                  rightSection={statuses.includes(taskStatus) ? <IconCheck size={16} /> : null}
                >
                  <Text size="sm">{taskStatus}</Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Menu.Item>

        {/* Priority Submenu */}
        <Menu.Item>
          <Menu trigger="hover" openDelay={100} closeDelay={400} position="right-start" offset={5}>
            <Menu.Target>
              <Flex align="center" justify="space-between" w="100%">
                <Flex align="center" gap="xs">
                  <IconExclamationCircle size={16} />
                  <Text size="sm">Priority</Text>
                </Flex>
                <IconChevronRight size={16} />
              </Flex>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Task Priority</Menu.Label>
              {TASK_PRIORITIES.map((taskPriority) => (
                <Menu.Item
                  key={taskPriority}
                  onClick={() => onFilterChange?.(TaskFilterType.PRIORITY, taskPriority ?? '')}
                  rightSection={priorities.includes(taskPriority) ? <IconCheck size={16} /> : null}
                >
                  <Text size="sm">{taskPriority}</Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Menu.Item>

        <Menu.Item>
          <Menu trigger="hover" openDelay={100} closeDelay={400} position="right-start" offset={5}>
            <Menu.Target>
              <Flex align="center" justify="space-between" w="100%">
                <Flex align="center" gap="xs">
                  <IconUserCheck size={16} />
                  <Text size="sm">Performer Type</Text>
                </Flex>
                <IconChevronRight size={16} />
              </Flex>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>Performer Types</Menu.Label>
              {uniquePerformerTypes.length > 0 ? (
                uniquePerformerTypes.map((type, index) => (
                  <Menu.Item
                    key={`${type.coding?.[0]?.code ?? index}`}
                    onClick={() => onFilterChange?.(TaskFilterType.PERFORMER_TYPE, type)}
                    rightSection={
                      performerType?.coding?.[0]?.code === type.coding?.[0]?.code ? <IconCheck size={16} /> : null
                    }
                  >
                    <Text size="sm">{type.coding?.[0]?.display ?? type.coding?.[0]?.code ?? 'Unknown'}</Text>
                  </Menu.Item>
                ))
              ) : (
                <Menu.Item disabled>
                  <Text size="sm" c="dimmed">
                    No performer types available
                  </Text>
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

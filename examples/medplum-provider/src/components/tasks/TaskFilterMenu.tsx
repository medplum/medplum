// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Indicator, Menu, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { CodeableConcept, Patient, Task } from '@medplum/fhirtypes';
import {
  IconCheck,
  IconChevronRight,
  IconExclamationCircle,
  IconFilter2Plus,
  IconStethoscope,
  IconUserCheck,
  IconX,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import type { TaskFilterValue } from './TaskFilterMenu.utils';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TaskFilterType,
} from './TaskFilterMenu.utils';

function capitalizeLabel(value: string): string {
  return value
    .split(/[- ]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function ActiveDot(): JSX.Element {
  return <Box w={8} h={8} style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-blue-6)' }} />;
}

interface FilterSubmenuProps {
  icon: ReactNode;
  label: string;
  isActive: boolean;
  children: ReactNode;
}

function FilterSubmenu({ icon, label, isActive, children }: FilterSubmenuProps): JSX.Element {
  return (
    <Menu.Item p={0}>
      <Menu trigger="hover" position="right-start" offset={{ mainAxis: 0, crossAxis: -8 }} shadow="md" radius="md">
        <Menu.Target>
          <Flex align="center" justify="space-between" w="100%" px="sm" py="xs" style={{ cursor: 'default' }}>
            <Flex align="center" gap="xs">
              {icon}
              <Text size="sm">{label}</Text>
            </Flex>
            <Flex align="center" gap={4}>
              {isActive && <ActiveDot />}
              <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
            </Flex>
          </Flex>
        </Menu.Target>
        <Menu.Dropdown className="filter-submenu-dropdown">{children}</Menu.Dropdown>
      </Menu>
    </Menu.Item>
  );
}

interface TaskFilterMenuProps {
  statuses?: Task['status'][];
  owner?: Task['owner'];
  performerType?: CodeableConcept;
  priorities?: Task['priority'][];
  patient?: Patient;
  performerTypes?: CodeableConcept[];
  onFilterChange?: (filterType: TaskFilterType, value: TaskFilterValue) => void;
  onClearAllFilters?: () => void;
}

export function TaskFilterMenu(props: TaskFilterMenuProps): JSX.Element {
  const { statuses = [], priorities = [], performerType, performerTypes, onFilterChange, onClearAllFilters } = props;
  const [opened, { open, close }] = useDisclosure(false);

  const uniquePerformerTypes =
    performerTypes?.filter((performerType, index, self) => {
      const identifier = performerType.coding?.[0]?.code || performerType.text;
      return identifier && self.findIndex((pt) => (pt.coding?.[0]?.code || pt.text) === identifier) === index;
    }) || [];

  const hasActiveFilter = statuses.length > 0 || priorities.length > 0 || !!performerType;

  return (
    <Menu shadow="md" width={200} position="bottom-start" radius="md" opened={opened} onOpen={open} onClose={close}>
      <Menu.Target>
        <Tooltip label="Filter Tasks" position="bottom" openDelay={500} disabled={opened}>
          <Indicator disabled={!hasActiveFilter} color="blue" size={8} offset={5}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              aria-label="Filter tasks"
              className="outline-icon-button"
              data-opened={opened || undefined}
            >
              <IconFilter2Plus size={16} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Filter Tasks</Menu.Label>

        <FilterSubmenu
          icon={<IconStethoscope size={16} color="var(--mantine-color-dimmed)" />}
          label="Status"
          isActive={statuses.length > 0}
        >
          {TASK_STATUSES.map((taskStatus) => (
            <Menu.Item
              key={taskStatus}
              onClick={() => onFilterChange?.(TaskFilterType.STATUS, taskStatus)}
              rightSection={
                statuses.includes(taskStatus) ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null
              }
            >
              <Text size="sm">{TASK_STATUS_LABELS[taskStatus]}</Text>
            </Menu.Item>
          ))}
        </FilterSubmenu>

        <FilterSubmenu
          icon={<IconExclamationCircle size={16} color="var(--mantine-color-dimmed)" />}
          label="Priority"
          isActive={priorities.length > 0}
        >
          {TASK_PRIORITIES.map((taskPriority) => (
            <Menu.Item
              key={taskPriority}
              onClick={() => onFilterChange?.(TaskFilterType.PRIORITY, taskPriority ?? '')}
              rightSection={
                priorities.includes(taskPriority) ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null
              }
            >
              <Text size="sm">{taskPriority ? TASK_PRIORITY_LABELS[taskPriority] : ''}</Text>
            </Menu.Item>
          ))}
        </FilterSubmenu>

        <FilterSubmenu
          icon={<IconUserCheck size={16} color="var(--mantine-color-dimmed)" />}
          label="Performer Type"
          isActive={!!performerType}
        >
          {uniquePerformerTypes.length > 0 ? (
            uniquePerformerTypes.map((type, index) => (
              <Menu.Item
                key={`${type.coding?.[0]?.code ?? index}`}
                onClick={() => onFilterChange?.(TaskFilterType.PERFORMER_TYPE, type)}
                rightSection={
                  performerType?.coding?.[0]?.code === type.coding?.[0]?.code ? (
                    <IconCheck size={16} color="var(--mantine-color-blue-6)" />
                  ) : null
                }
              >
                <Text size="sm">
                  {capitalizeLabel(type.coding?.[0]?.display ?? type.coding?.[0]?.code ?? 'Unknown')}
                </Text>
              </Menu.Item>
            ))
          ) : (
            <Menu.Item disabled>
              <Text size="sm" c="dimmed">
                No performer types available
              </Text>
            </Menu.Item>
          )}
        </FilterSubmenu>

        {hasActiveFilter && (
          <>
            <Divider my={4} mx={4} />
            <Menu.Item
              leftSection={<IconX size={16} color="var(--mantine-color-dimmed)" />}
              onClick={() => {
                onClearAllFilters?.();
                close();
              }}
            >
              <Text size="sm">Clear All Filters</Text>
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

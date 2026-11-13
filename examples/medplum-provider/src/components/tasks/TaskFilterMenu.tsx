// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Button, Divider, Flex, Indicator, Menu, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { CodeableConcept, Patient, Reference, ResourceType, Task } from '@medplum/fhirtypes';
import { Modal, ReferenceInput } from '@medplum/react';
import {
  IconCheck,
  IconChevronRight,
  IconExclamationCircle,
  IconFilter2Plus,
  IconStethoscope,
  IconUser,
  IconUserCheck,
  IconX,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
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

const ASSIGNED_TARGET_TYPES: ResourceType[] = ['Practitioner', 'Organization', 'CareTeam'];

interface TaskFilterMenuProps {
  statuses?: Task['status'][];
  selectedOwner?: string;
  performerType?: CodeableConcept;
  priorities?: Task['priority'][];
  patient?: Patient;
  performerTypes?: CodeableConcept[];
  isMyTasksTab?: boolean;
  onFilterChange?: (filterType: TaskFilterType, value: TaskFilterValue) => void;
  onClearAllFilters?: () => void;
}

export function TaskFilterMenu(props: TaskFilterMenuProps): JSX.Element {
  const {
    statuses = [],
    priorities = [],
    selectedOwner,
    performerType,
    performerTypes,
    isMyTasksTab,
    onFilterChange,
    onClearAllFilters,
  } = props;
  const [opened, { open, close }] = useDisclosure(false);
  const [assigneeModalOpened, { open: openAssigneeModal, close: closeAssigneeModal }] = useDisclosure(false);
  const [draftOwner, setDraftOwner] = useState<Reference | undefined>(
    selectedOwner ? { reference: selectedOwner } : undefined
  );

  const uniquePerformerTypes =
    performerTypes?.filter((performerType, index, self) => {
      const identifier = performerType.coding?.[0]?.code || performerType.text;
      return identifier && self.findIndex((pt) => (pt.coding?.[0]?.code || pt.text) === identifier) === index;
    }) || [];

  const hasActiveFilter = statuses.length > 0 || priorities.length > 0 || !!performerType || !!selectedOwner;

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

        {!isMyTasksTab && (
          <Menu.Item
            leftSection={<IconUser size={16} color="var(--mantine-color-dimmed)" />}
            rightSection={
              <Flex align="center" gap={4}>
                {selectedOwner && <ActiveDot />}
                <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
              </Flex>
            }
            onClick={() => {
              setDraftOwner(selectedOwner ? { reference: selectedOwner } : undefined);
              close();
              openAssigneeModal();
            }}
          >
            <Text size="sm">Assigned</Text>
          </Menu.Item>
        )}

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
      <Modal
        opened={assigneeModalOpened}
        onClose={closeAssigneeModal}
        title="Filter by assignee"
        size="md"
        actions={
          <Button
            disabled={!draftOwner?.reference || draftOwner.reference === selectedOwner}
            onClick={() => {
              if (draftOwner?.reference) {
                onFilterChange?.(TaskFilterType.OWNER, draftOwner.reference);
                closeAssigneeModal();
              }
            }}
          >
            Apply
          </Button>
        }
      >
        <ReferenceInput
          name="assignee"
          targetTypes={ASSIGNED_TARGET_TYPES}
          defaultValue={selectedOwner ? { reference: selectedOwner } : undefined}
          onChange={(value) => setDraftOwner(value as Reference | undefined)}
        />
      </Modal>
    </Menu>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Indicator, Menu, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconChevronRight, IconFilter2Plus, IconStethoscope, IconX } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';

const FAX_STATUSES = ['in-progress', 'completed', 'stopped', 'entered-in-error'] as const;
type FaxStatus = (typeof FAX_STATUSES)[number];

const FAX_STATUS_LABELS: Record<FaxStatus, string> = {
  'in-progress': 'Unread',
  completed: 'Read / Archived',
  stopped: 'Failed',
  'entered-in-error': 'Error',
};

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
              <IconChevronRight size={16} color="var(--mantine-color-gray-6)" />
            </Flex>
          </Flex>
        </Menu.Target>
        <Menu.Dropdown className="filter-submenu-dropdown">{children}</Menu.Dropdown>
      </Menu>
    </Menu.Item>
  );
}

interface FaxFilterMenuProps {
  selectedStatuses: string[];
  onStatusToggle: (status: string) => void;
  onClearAll: () => void;
}

export function FaxFilterMenu({ selectedStatuses, onStatusToggle, onClearAll }: FaxFilterMenuProps): JSX.Element {
  const [opened, { open, close }] = useDisclosure(false);
  const hasActiveFilter = selectedStatuses.length > 0;

  return (
    <Menu shadow="md" width={200} position="bottom-start" radius="md" opened={opened} onOpen={open} onClose={close}>
      <Menu.Target>
        <Tooltip label="Filter Faxes" position="bottom" openDelay={500} disabled={opened}>
          <Indicator disabled={!hasActiveFilter} color="blue" size={8} offset={5}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              aria-label="Filter faxes"
              className="outline-icon-button"
              data-opened={opened || undefined}
            >
              <IconFilter2Plus size={16} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Filter Faxes</Menu.Label>

        <FilterSubmenu
          icon={<IconStethoscope size={16} color="var(--mantine-color-gray-6)" />}
          label="Status"
          isActive={selectedStatuses.length > 0}
        >
          {FAX_STATUSES.map((status) => (
            <Menu.Item
              key={status}
              onClick={() => onStatusToggle(status)}
              rightSection={
                selectedStatuses.includes(status) ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null
              }
            >
              <Text size="sm">{FAX_STATUS_LABELS[status]}</Text>
            </Menu.Item>
          ))}
        </FilterSubmenu>

        {hasActiveFilter && (
          <>
            <Divider my={4} mx={4} />
            <Menu.Item
              leftSection={<IconX size={16} color="var(--mantine-color-gray-6)" />}
              onClick={() => {
                onClearAll();
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

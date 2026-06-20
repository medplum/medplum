// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Divider, Indicator, Menu, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconFilter2Plus, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { DocumentSource } from './DocumentListItem.utils';
import { DOCUMENT_SOURCES } from './DocumentListItem.utils';

interface DocumentFilterMenuProps {
  sources?: DocumentSource[];
  onSourceToggle?: (source: DocumentSource) => void;
  onClearAllFilters?: () => void;
}

export function DocumentFilterMenu(props: DocumentFilterMenuProps): JSX.Element {
  const { sources = [], onSourceToggle, onClearAllFilters } = props;
  const [opened, { open, close }] = useDisclosure(false);

  const hasActiveFilter = sources.length > 0;

  return (
    <Menu shadow="md" width={200} position="bottom-start" radius="md" opened={opened} onOpen={open} onClose={close}>
      <Menu.Target>
        <Tooltip label="Filter Documents" position="bottom" openDelay={500} disabled={opened}>
          <Indicator disabled={!hasActiveFilter} color="blue" size={8} offset={5}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              aria-label="Filter documents"
              className="outline-icon-button"
              data-opened={opened || undefined}
            >
              <IconFilter2Plus size={16} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>Document Source</Menu.Label>

        {DOCUMENT_SOURCES.map((source) => (
          <Menu.Item
            key={source}
            onClick={() => onSourceToggle?.(source)}
            rightSection={sources.includes(source) ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null}
          >
            <Text size="sm">{source}</Text>
          </Menu.Item>
        ))}

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

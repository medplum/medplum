// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Indicator, Menu, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconFilter2Plus } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { DocumentSourceOption } from './DocumentSourceFilterMenu.utils';
import { DOCUMENT_SOURCE_OPTIONS } from './DocumentSourceFilterMenu.utils';

export interface DocumentSourceFilterMenuProps {
  readonly value: DocumentSourceOption | undefined;
  readonly onChange: (source: DocumentSourceOption | undefined) => void;
}

export function DocumentSourceFilterMenu({ value, onChange }: DocumentSourceFilterMenuProps): JSX.Element {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Menu shadow="md" width={200} position="bottom-start" radius="md" opened={opened} onOpen={open} onClose={close}>
      <Menu.Target>
        <Tooltip label="Filter documents" position="bottom" openDelay={500} disabled={opened}>
          <Indicator disabled={!value} color="blue" size={8} offset={5}>
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
        {DOCUMENT_SOURCE_OPTIONS.map((option) => (
          <Menu.Item
            key={option.source}
            onClick={() => onChange(option.source === value?.source ? undefined : option)}
            rightSection={
              option.source === value?.source ? <IconCheck size={16} color="var(--mantine-color-blue-6)" /> : null
            }
          >
            <Text size="sm">{option.label}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

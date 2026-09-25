// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Checkbox, Divider, Group, Popover, Stack, Text, TextInput } from '@mantine/core';
import { IconAdjustmentsHorizontal, IconPlus, IconSearch } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
// Shared with the booking workspace's sidebar rather than moved, while that sidebar has changes in flight.
import { SectionHeader } from '../../SchedulingWorkspace/CalendarsPanel/SectionHeader';
import { ConfigRow } from './ConfigRow';

export interface ConfigPanelItem {
  readonly id: string;
  readonly label: string;
  /** Required, unlike `CalendarsPanelItem.selected`, which defaults to true: here nothing starts selected. */
  readonly selected: boolean;
  /** The resource is turned off. */
  readonly inactive?: boolean;
  readonly imageUrl?: string;
}

export interface ConfigPanelSection {
  readonly key: string;
  readonly title: string;
  /** The section's rows, already narrowed by the filters. */
  readonly items: readonly ConfigPanelItem[];
  /** What the section lists, in the plural, for its empty and incomplete messages: `visit types`. */
  readonly noun: string;
  readonly loading?: boolean;
  /** The read stopped at its limit, so the list is not everything the project holds. */
  readonly incomplete?: boolean;
  /** Stands in for the avatar on each row. */
  readonly icon?: ReactNode;
  /** Labels a button in the header that starts creating one. Given with `onCreate`. */
  readonly createLabel?: string;
  readonly onCreate?: () => void;
}

export interface ConfigPanelProps {
  readonly sections: readonly ConfigPanelSection[];
  readonly onSelect: (sectionKey: string, id: string) => void;
  /** The text narrowing the rows. The host applies it; the panel only renders the field. */
  readonly filter: string;
  readonly onFilterChange: (filter: string) => void;
  /** Whether turned-off resources are listed. The host applies it too. */
  readonly showInactive: boolean;
  readonly onShowInactiveChange: (showInactive: boolean) => void;
  readonly className?: string;
}

/**
 * The configuration sidebar: one section per kind of resource, with one row selected at a time, a text
 * filter, and a filters menu that lists turned-off resources on request.
 *
 * Presentational, like `CalendarsPanel`: it renders what it is given and searches nothing, which is why the
 * filters are controlled and applied by the host.
 * @param props - The sections, the selection handler, and the filters.
 * @returns The sidebar.
 */
export function ConfigPanel(props: ConfigPanelProps): JSX.Element {
  const { sections, onSelect, filter, onFilterChange, showInactive, onShowInactiveChange, className } = props;

  return (
    <Stack gap="xs" className={className}>
      <Group gap="xs" wrap="nowrap">
        <TextInput
          aria-label="Filter"
          placeholder="Filter"
          leftSection={<IconSearch size={16} />}
          value={filter}
          onChange={(event) => onFilterChange(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Popover position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <ActionIcon
              variant={showInactive ? 'light' : 'default'}
              size="lg"
              aria-label="Filters"
              data-active={showInactive || undefined}
            >
              <IconAdjustmentsHorizontal size={18} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Checkbox
              label="Show inactive"
              checked={showInactive}
              onChange={(event) => onShowInactiveChange(event.currentTarget.checked)}
            />
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Divider />

      {sections.map((section) => (
        <Stack key={section.key} gap="xs">
          <SectionHeader
            title={section.title}
            loading={section.loading}
            count={section.items.length}
            actions={
              section.onCreate && (
                <ActionIcon variant="subtle" onClick={section.onCreate} aria-label={section.createLabel}>
                  <IconPlus size={18} />
                </ActionIcon>
              )
            }
          >
            {section.items.length === 0 ? (
              !section.loading && (
                <Text c="dimmed" size="sm" pl="xs">
                  {filter.trim() ? `No matching ${section.noun}` : `No ${section.noun} yet`}
                </Text>
              )
            ) : (
              <Stack gap={2}>
                {section.items.map((item) => (
                  <ConfigRow
                    key={item.id}
                    item={item}
                    icon={section.icon}
                    onSelect={(id) => onSelect(section.key, id)}
                  />
                ))}
              </Stack>
            )}
            {section.incomplete && (
              <Text c="dimmed" size="xs" pl="xs" mt="xs">
                Not all {section.noun} are listed: there were more than could be loaded.
              </Text>
            )}
          </SectionHeader>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}

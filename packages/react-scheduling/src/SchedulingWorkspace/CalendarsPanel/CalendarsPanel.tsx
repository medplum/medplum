// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Group, Stack, Text } from '@mantine/core';
import {
  IconCalculatorFilled,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMapPinFilled,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { Fragment, useState } from 'react';
import type { BookableActorType } from '../../actors';
import { CalendarRow } from './CalendarRow';
import { SectionHeader } from './SectionHeader';

export interface CalendarsPanelItem {
  readonly id: string;
  readonly label: string;
  readonly imageUrl?: string;
  /** Defaults to true (selected/visible) when omitted. */
  readonly selected?: boolean;
}

export interface CalendarsPanelProps {
  /** Shows a loading indicator on every section while their candidates are being fetched. */
  readonly candidatesLoading?: boolean;
  /**
   * The fields narrowing which calendars are worth listing at all, shown above them —
   * or omitted to leave the filters out entirely, which is what a host filtering
   * nothing should pass. The panel renders whatever is given and reads none of it.
   */
  readonly filters?: ReactNode;
  /** The rows to show in each section, keyed by the actor type whose schedules they are. */
  readonly items: Readonly<Record<BookableActorType, readonly CalendarsPanelItem[]>>;
  readonly onToggle?: (actorType: BookableActorType, id: string) => void;
  readonly className?: string;
}

interface CalendarsPanelSection {
  readonly actorType: BookableActorType;
  readonly title: string;
  /** Names the section's contents in its "No ... found" placeholder. */
  readonly emptyLabel: string;
  readonly icon?: ReactNode;
}

/**
 * The sections rendered, in the order they are shown.
 *
 * Display order is set here rather than taken from `BOOKABLE_ACTOR_TYPES`: what
 * a user is asked about first is not what reads best down a sidebar.
 */
const SECTIONS: readonly CalendarsPanelSection[] = [
  { actorType: 'Practitioner', title: 'Providers & Staff', emptyLabel: 'providers or staff' },
  { actorType: 'Device', title: 'Devices', emptyLabel: 'devices', icon: <IconCalculatorFilled size={12} /> },
  { actorType: 'Location', title: 'Rooms', emptyLabel: 'rooms', icon: <IconMapPinFilled size={12} /> },
];

/**
 * A sidebar panel for selecting calendars, grouped under collapsible sections, above
 * which a host may place the fields narrowing which calendars are worth listing at all.
 * The whole panel collapses to a single button that brings it back.
 *
 * This is a presentational component that renders whatever is passed in. It does not
 * fetch or group FHIR resources, which is why the filters arrive as a node rather than
 * as options to render: the fields search the server, and a panel that renders lists
 * has no business doing that.
 *
 * @param props - Component props
 * @returns A React Node with the Calendars panel UI in it
 */
export function CalendarsPanel(props: CalendarsPanelProps): JSX.Element {
  const { items, candidatesLoading, filters, onToggle, className } = props;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {collapsed && (
        <ActionIcon
          variant="subtle"
          color="gray"
          mt="xs"
          aria-label="Show calendars"
          onClick={() => setCollapsed(false)}
        >
          <IconLayoutSidebarLeftExpand size={18} />
        </ActionIcon>
      )}
      {/* Hidden rather than unmounted, so the filter fields and open sections are as they were left. */}
      <Stack gap="xs" w={300} display={collapsed ? 'none' : undefined} className={className}>
        <Group justify="space-between" wrap="nowrap">
          <Text fz="lg" fw={800} py="xs">
            Calendars
          </Text>
          <ActionIcon variant="subtle" color="gray" aria-label="Hide calendars" onClick={() => setCollapsed(true)}>
            <IconLayoutSidebarLeftCollapse size={18} />
          </ActionIcon>
        </Group>
        <Divider />

        {filters && (
          <>
            <Box mb="xs" role="group" aria-label="Filter calendars">
              {filters}
            </Box>
            <Divider />
          </>
        )}

        {SECTIONS.map((section) => {
          const sectionItems = items[section.actorType];
          return (
            <Fragment key={section.actorType}>
              <SectionHeader title={section.title} loading={candidatesLoading}>
                {sectionItems.length === 0 && !candidatesLoading ? (
                  <Text fz="sm" c="dimmed" p="xs">
                    No {section.emptyLabel} found
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {sectionItems.map((item) => (
                      <CalendarRow
                        key={item.id}
                        item={item}
                        onToggle={onToggle && ((id) => onToggle(section.actorType, id))}
                        icon={section.icon}
                      />
                    ))}
                  </Stack>
                )}
              </SectionHeader>
              <Divider />
            </Fragment>
          );
        })}
      </Stack>
    </>
  );
}

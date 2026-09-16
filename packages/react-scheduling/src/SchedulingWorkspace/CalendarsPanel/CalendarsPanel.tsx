// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineThemeColors } from '@mantine/core';
import { Divider, Stack, Text } from '@mantine/core';
import { IconMapPinFilled } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { Fragment } from 'react';
import type { BookableActorType } from '../../actors';
import { CalendarRow } from './CalendarRow';
import { SectionHeader } from './SectionHeader';

export interface CalendarsPanelItem {
  readonly id: string;
  readonly label: string;
  readonly color: keyof MantineThemeColors;
  readonly imageUrl?: string;
  /** Defaults to true (selected/visible) when omitted. */
  readonly selected?: boolean;
}

export interface CalendarsPanelProps {
  /** Shows a loading indicator on every section while their candidates are being fetched. */
  readonly candidatesLoading?: boolean;
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
  { actorType: 'Device', title: 'Devices', emptyLabel: 'devices' },
  { actorType: 'Location', title: 'Rooms', emptyLabel: 'rooms', icon: <IconMapPinFilled size={12} /> },
];

/**
 * A sidebar panel for selecting calendars, grouped under collapsible sections.
 *
 * This is a presentational component that renders whatever is passed in. It
 * does not fetch or group FHIR resources.
 *
 * @param props - Component props
 * @returns A React Node with the Calendars panel UI in it
 */
export function CalendarsPanel(props: CalendarsPanelProps): JSX.Element {
  const { items, candidatesLoading, onToggle, className } = props;

  return (
    <Stack gap="xs" className={className}>
      <Text fz="lg" fw={800} py="xs">
        Calendars
      </Text>
      <Divider />

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
                      color={item.color}
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
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineThemeColors } from '@mantine/core';
import { Divider, Stack, Text } from '@mantine/core';
import { IconMapPinFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
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
  /** Shows a loading indicator on the Providers & Staff, Devices, and Rooms sections while their candidates are being fetched. */
  readonly candidatesLoading?: boolean;
  readonly providers: readonly CalendarsPanelItem[];
  readonly devices: readonly CalendarsPanelItem[];
  readonly rooms: readonly CalendarsPanelItem[];
  readonly onToggleProvider?: (id: string) => void;
  readonly onToggleDevice?: (id: string) => void;
  readonly onToggleRoom?: (id: string) => void;
  readonly className?: string;
}

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
  const { providers, devices, rooms, candidatesLoading, onToggleProvider, onToggleDevice, onToggleRoom, className } =
    props;

  const renderEmpty = (label: string): JSX.Element => {
    return (
      <Text fz="sm" c="dimmed" p="xs">
        No {label} found
      </Text>
    );
  };

  return (
    <Stack gap="xs" className={className}>
      <Text fz="lg" fw={800} py="xs">
        Calendars
      </Text>
      <Divider />

      <SectionHeader title="Providers & Staff" loading={candidatesLoading}>
        {providers.length === 0 && !candidatesLoading ? (
          renderEmpty('providers or staff')
        ) : (
          <Stack gap={2}>
            {providers.map((item) => (
              <CalendarRow key={item.id} item={item} color={item.color} onToggle={onToggleProvider} />
            ))}
          </Stack>
        )}
      </SectionHeader>
      <Divider />

      <SectionHeader title="Devices" loading={candidatesLoading}>
        {devices.length === 0 && !candidatesLoading ? (
          renderEmpty('devices')
        ) : (
          <Stack gap={2}>
            {devices.map((item) => (
              <CalendarRow key={item.id} item={item} color={item.color} onToggle={onToggleDevice} />
            ))}
          </Stack>
        )}
      </SectionHeader>
      <Divider />

      <SectionHeader title="Rooms" loading={candidatesLoading}>
        {rooms.length === 0 && !candidatesLoading ? (
          renderEmpty('rooms')
        ) : (
          <Stack gap={2}>
            {rooms.map((item) => (
              <CalendarRow
                key={item.id}
                item={item}
                color={item.color}
                onToggle={onToggleRoom}
                icon={<IconMapPinFilled size={12} />}
              />
            ))}
          </Stack>
        )}
      </SectionHeader>
      <Divider />
    </Stack>
  );
}

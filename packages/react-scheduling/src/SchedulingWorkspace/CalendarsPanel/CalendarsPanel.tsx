// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Stack, Text } from '@mantine/core';
import { IconCalculatorFilled, IconMapPinFilled } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import type { BookableActorType } from '../../actors';
import { CalendarRow } from './CalendarRow';
import { PanelSection } from './PanelSection';
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
 * A sidebar panel for selecting calendars, grouped by what they are held on, above
 * which a host may place the fields narrowing which calendars are worth listing at all.
 *
 * The calendars are one section, headed as the host's own sections are expected to be (see
 * `PanelSection`), with the groups inside it headed more lightly.
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

  return (
    <Stack gap="md" className={className}>
      {filters && (
        <>
          <Box role="group" aria-label="Filter calendars">
            {filters}
          </Box>
          <Divider />
        </>
      )}

      <PanelSection title="Calendars" description="Show or hide individual calendars.">
        {SECTIONS.map((section) => {
          const sectionItems = items[section.actorType];
          return (
            <SectionHeader key={section.actorType} title={section.title} loading={candidatesLoading} nested>
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
          );
        })}
      </PanelSection>
    </Stack>
  );
}

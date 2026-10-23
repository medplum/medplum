// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';
// FullCalendar's sheets go first: MultiCalendar's rules are written to override them, and this may
// be the first module on the page to load MultiCalendar's.
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import { colorClass } from '../colors';
import classes from './MultiCalendar.module.css';

export interface AppointmentColorPreviewProps {
  /** A hex code, as a SchedulingColor names one. */
  readonly color: string;
  readonly title: string;
  readonly colorScheme: 'light' | 'dark';
}

/**
 * A sample appointment, drawn by MultiCalendar's own rules in a hex color, as the calendar would draw it in
 * the given color scheme, whichever the page is in.
 * @param props - The color, the title, and the color scheme to draw it with.
 * @returns The sample.
 */
export function AppointmentColorPreview(props: AppointmentColorPreviewProps): JSX.Element {
  const { color, title, colorScheme } = props;
  const theme = useMantineTheme();

  return (
    <Box
      className={classes.wrapper}
      role="img"
      aria-label={`Appointment preview, ${colorScheme} mode`}
      style={{ '--fc-event-color': color }}
    >
      {/* Stands in for FullCalendar's root, whose scheme its palette and MultiCalendar's rules read. */}
      <Box data-color-scheme={colorScheme} bg="var(--fc-classic-background)" p={8} bdrs="sm">
        <Box className={`appointment ${colorClass(theme, color)}`} w={180} py={2} pr={4} bdrs="sm">
          <div className={classes.eventInner}>
            <Text size="xs" fw={500} truncate>
              {title}
            </Text>
            <Text className={classes.eventTime} fz={10}>
              9:00 – 9:30am
            </Text>
          </div>
        </Box>
      </Box>
    </Box>
  );
}

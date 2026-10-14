// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text, useComputedColorScheme } from '@mantine/core';
import type { JSX } from 'react';
// FullCalendar's sheets go first: MultiCalendar's rules are written to override them, and this may
// be the first module on the page to load MultiCalendar's.
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import classes from './MultiCalendar.module.css';

export interface AppointmentColorPreviewProps {
  /** A hex code, as a SchedulingColor names one. */
  readonly color: string;
  readonly title: string;
}

/**
 * A sample appointment, drawn by MultiCalendar's own rules in a hex color, as the calendar would draw it.
 * @param props - The color and the title to draw it with.
 * @returns The sample.
 */
export function AppointmentColorPreview(props: AppointmentColorPreviewProps): JSX.Element {
  const { color, title } = props;
  // The rules read the scheme from the attribute FullCalendar sets on its root, and there's no calendar here.
  const colorScheme = useComputedColorScheme();

  return (
    <Box
      className={classes.wrapper}
      data-color-scheme={colorScheme}
      role="img"
      aria-label="Appointment preview"
      style={{ '--fc-event-color': color }}
    >
      <Box className="appointment hex-color" w={180} py={2} pr={4} bdrs="sm">
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
  );
}

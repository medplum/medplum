// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';

export interface PanelSectionProps {
  readonly title: string;
  /** One line saying what the section's controls do to the calendar. */
  readonly description: string;
  readonly children: ReactNode;
}

/**
 * One of the sidebar's top-level sections. Each is headed the same way, with a line saying what it does,
 * so that controls doing different things to the calendar read as peers and not as one long form.
 * @param props - The React props.
 * @returns The section.
 */
export function PanelSection(props: PanelSectionProps): JSX.Element {
  const { title, description, children } = props;
  const headingId = useId();
  return (
    <Box component="section" aria-labelledby={headingId}>
      <Text id={headingId} fz="md" fw={800}>
        {title}
      </Text>
      <Text fz="xs" c="dimmed" mb="sm">
        {description}
      </Text>
      {children}
    </Box>
  );
}

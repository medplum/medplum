// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineSpacing } from '@mantine/core';
import { Card, Group, Stack, Text } from '@mantine/core';
import type { JSX, MouseEvent, ReactNode } from 'react';
import classes from './DetailSection.module.css';

/**
 * A titled section of the claim drawer, in a card, with an optional dimmed line under the title.
 * @param props - The section props.
 * @param props.title - The subhead.
 * @param props.label - The section's accessible name, when it differs from the title.
 * @param props.description - The dimmed line under it.
 * @param props.action - A button at the right of the subhead.
 * @param props.className - A class for the section.
 * @param props.gap - The space between the header and each child.
 * @param props.children - The section content.
 * @returns The section.
 */
export function DetailSection(props: {
  readonly title: string;
  /** The section's accessible name, when it differs from the title. */
  readonly label?: string;
  readonly description?: ReactNode;
  /** A button at the right of the subhead. */
  readonly action?: ReactNode;
  readonly className?: string;
  /** The space between the header and each child. */
  readonly gap?: MantineSpacing;
  readonly children: ReactNode;
}): JSX.Element {
  const content = (
    <Stack gap={props.gap ?? 'md'}>
      <div>
        <Group justify="space-between" wrap="nowrap">
          <Text fz="lg" fw={800}>
            {props.title}
          </Text>
          {props.action}
        </Group>
        {props.description && (
          <Text size="sm" c="dimmed">
            {props.description}
          </Text>
        )}
      </div>
      {props.children}
    </Stack>
  );
  return (
    <Card
      withBorder
      shadow="sm"
      p="md"
      component="section"
      aria-label={props.label ?? props.title}
      onMouseDownCapture={blurOnLabelPress}
      onClickCapture={blurOnLabelPress}
      className={props.className ? `${classes.card} ${props.className}` : classes.card}
    >
      {content}
    </Card>
  );
}

export function MetaItem(props: { readonly label: string; readonly value: ReactNode }): JSX.Element {
  return (
    <div style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed" fw={500}>
        {props.label}
      </Text>
      {/* Long IDs have no spaces to break at, so let them wrap anywhere rather than run into the next column. */}
      <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
        {props.value}
      </Text>
    </div>
  );
}

/**
 * Closes an open search dropdown when its field's label is pressed. A label click normally focuses the field, which
 * would keep its dropdown open, so for search fields the press blurs the field instead.
 * @param e - The mouse event.
 */
function blurOnLabelPress(e: MouseEvent<HTMLElement>): void {
  const label = (e.target as HTMLElement).closest('label');
  const field = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (field?.getAttribute('role') === 'searchbox') {
    e.preventDefault();
    if (e.type === 'mousedown' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }
}

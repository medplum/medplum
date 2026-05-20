// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineColor } from '@mantine/core';
import { Flex, Stack, Text, ThemeIcon } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface ListEmptyStateProps {
  /**
   * Heading text. Most one-liners just pass this. When `description` and/or
   * `icon` are also provided, it becomes a larger empty-state layout suitable
   * for empty detail panes (e.g. "No task selected").
   */
  readonly message: string;
  /**
   * Optional secondary text rendered below the heading. Use this for the
   * supporting instructional copy in selection-empty states.
   */
  readonly description?: string;
  /**
   * Optional icon — typically a `@tabler/icons-react` element. Wrapped in a
   * Mantine `ThemeIcon` sized 64px above the text.
   */
  readonly icon?: ReactNode;
  /** Color for the wrapping `ThemeIcon`. Defaults to `gray`. */
  readonly iconColor?: MantineColor;
}

/**
 * Empty/placeholder state for a `ListShell`, `ListDetailLayout.Column`, or any
 * "nothing here" pane. Renders a centered column with an optional icon, a
 * required heading, and an optional description — the same shape used by all
 * of the provider example's hand-rolled empty states (TaskSelectEmpty,
 * FaxSelectEmpty, NoMessages, …).
 * @param props - Empty-state content (message, description, icon, iconColor).
 * @returns The centered empty-state element.
 */
export function ListEmptyState(props: ListEmptyStateProps): JSX.Element {
  const { message, description, icon, iconColor = 'gray' } = props;
  const hasIcon = icon !== undefined;
  const hasDescription = description !== undefined;
  const headingSize = hasIcon || hasDescription ? 'lg' : 'md';

  return (
    <Flex direction="column" h="100%" w="100%" justify="center" align="center" pt={hasIcon ? 0 : 'xl'}>
      <Stack align="center" gap="md">
        {hasIcon && (
          <ThemeIcon size={64} variant="light" color={iconColor}>
            {icon}
          </ThemeIcon>
        )}
        <Stack align="center" gap="xs">
          <Text size={headingSize} c="dimmed" fw={500} ta="center">
            {message}
          </Text>
          {hasDescription && (
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {description}
            </Text>
          )}
        </Stack>
      </Stack>
    </Flex>
  );
}

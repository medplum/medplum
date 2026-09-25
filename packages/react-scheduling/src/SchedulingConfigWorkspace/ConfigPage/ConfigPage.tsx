// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import classes from './ConfigPage.module.css';

export interface ConfigSectionProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}

/**
 * One titled section of a configuration page.
 * @param props - The title, an optional line under it, and the section's fields.
 * @returns The section.
 */
export function ConfigSection(props: ConfigSectionProps): JSX.Element {
  const titleId = useId();
  return (
    <Paper component="section" withBorder radius="md" p="xl" aria-labelledby={titleId}>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={3} size="h4" id={titleId}>
            {props.title}
          </Title>
          {props.description && (
            <Text size="sm" c="dimmed">
              {props.description}
            </Text>
          )}
        </Stack>
        {props.children}
      </Stack>
    </Paper>
  );
}

export interface SaveBarProps {
  /** Whether the page holds anything unsaved. The bar shows only while it does. */
  readonly dirty: boolean;
  /** What the bar says. Defaults to `Unsaved changes`. */
  readonly message?: string;
  /** The save button's label. Defaults to `Save`. */
  readonly saveLabel?: string;
  readonly saving: boolean;
  /** Why Save is refused, when it is. */
  readonly blockedReason?: string;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}

/**
 * The bar at the foot of a configuration page that saves or discards everything on it at once.
 * @param props - Whether there is anything to save, why saving is refused, and the two actions.
 * @returns The bar, or nothing while the page matches what is stored.
 */
export function SaveBar(props: SaveBarProps): JSX.Element | null {
  const { dirty, message = 'Unsaved changes', saveLabel = 'Save', saving, blockedReason, onSave, onDiscard } = props;
  const reasonId = useId();
  if (!dirty) {
    return null;
  }
  const blocked = blockedReason !== undefined;

  return (
    <Group className={classes.saveBar} justify="space-between" wrap="nowrap" role="region" aria-label="Unsaved changes">
      <Text fw={600}>{message}</Text>
      <Group gap="sm" wrap="nowrap">
        <Button variant="default" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        {/* Marked disabled without the attribute, so the tooltip saying why stays reachable by keyboard. */}
        <Tooltip label={blockedReason} disabled={!blocked} multiline w={300} withArrow position="top">
          <Button
            onClick={onSave}
            loading={saving}
            data-disabled={blocked || undefined}
            aria-disabled={blocked || undefined}
            aria-describedby={blocked ? reasonId : undefined}
          >
            {saveLabel}
          </Button>
        </Tooltip>
      </Group>
      {blocked && <VisuallyHidden id={reasonId}>{blockedReason}</VisuallyHidden>}
    </Group>
  );
}

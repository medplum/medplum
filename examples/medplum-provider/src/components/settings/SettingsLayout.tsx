// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import classes from './SettingsLayout.module.css';

export interface SettingsPageProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}

/**
 * Centered, fixed-width column every settings page renders into, styled after the Get Started page.
 * @param props - The page title, optional description, and sections.
 * @returns The settings page.
 */
export function SettingsPage(props: SettingsPageProps): JSX.Element {
  return (
    <Box className={classes.page} pt="5rem" pb="4rem">
      <Container size="md" className={classes.container}>
        <Box mb="3rem">
          <Title order={2} fw={800}>
            {props.title}
          </Title>
          {props.description && (
            <Text size="lg" mt=".25rem" className={classes.textSecondary}>
              {props.description}
            </Text>
          )}
        </Box>
        <Stack gap="3rem">{props.children}</Stack>
      </Container>
    </Box>
  );
}

export interface SettingsSectionProps {
  readonly title?: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/**
 * A titled group of settings. Wraps its rows in a bordered, shadowed card with dividers between them.
 * @param props - The section title, optional description, icon, header actions, and rows.
 * @returns The settings section.
 */
export function SettingsSection(props: SettingsSectionProps): JSX.Element {
  return (
    <Box>
      {(props.title || props.actions) && (
        <Group mb="md" gap="sm" align="center" wrap="nowrap">
          {props.icon && <span className={classes.sectionIcon}>{props.icon}</span>}
          <Stack gap={0} style={{ flex: 1 }}>
            {props.title && (
              <Text fw={800} size="xl">
                {props.title}
              </Text>
            )}
            {props.description && (
              <Text size="sm" className={classes.textSecondary}>
                {props.description}
              </Text>
            )}
          </Stack>
          {props.actions}
        </Group>
      )}
      <Paper radius="md" withBorder shadow="sm" px="lg" className={classes.card}>
        {props.children}
      </Paper>
    </Box>
  );
}

export interface SettingsRowProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * One setting: a label and description on the left, its control on the right.
 * @param props - The label, optional description, and control.
 * @returns The settings row.
 */
export function SettingsRow(props: SettingsRowProps): JSX.Element {
  return (
    <Group justify="space-between" wrap="nowrap" gap="lg" py="md">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text fw={600}>{props.label}</Text>
        {props.description && (
          <Text size="sm" className={classes.textSecondary}>
            {props.description}
          </Text>
        )}
      </Stack>
      {props.children && <Box style={{ flexShrink: 0 }}>{props.children}</Box>}
    </Group>
  );
}

/**
 * Secondary text shown in place of rows, such as an empty state.
 * @param props - The note text.
 * @param props.children - The note text.
 * @returns The note.
 */
export function SettingsNote(props: { readonly children: ReactNode }): JSX.Element {
  return (
    <Text size="sm" py="md" className={classes.textSecondary}>
      {props.children}
    </Text>
  );
}

/**
 * A bordered, shadowed card for content that brings its own layout, such as a list with a toolbar.
 * @param props - The panel content.
 * @param props.children - The panel content.
 * @returns The panel.
 */
export function SettingsPanel(props: { readonly children: ReactNode }): JSX.Element {
  return (
    <Paper radius="md" withBorder shadow="sm" p="lg">
      {props.children}
    </Paper>
  );
}

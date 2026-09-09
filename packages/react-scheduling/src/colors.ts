// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineTheme, MantineThemeColors } from '@mantine/core';

/** A cycling palette used when nothing more specific names a color. */
export const FALLBACK_COLORS = [
  'indigo',
  'teal',
  'pink',
  'violet',
  'blue',
  'cyan',
  'lime',
  'red',
  'yellow',
  'grape',
  'orange',
] satisfies (keyof MantineThemeColors)[];

/**
 * Resolves the Mantine color name to render something with: an explicit color if it
 * names a real theme color, otherwise a color cycled from `FALLBACK_COLORS` by position.
 * @param theme - The active Mantine theme.
 * @param explicit - A color name to prefer, if it is a real theme color.
 * @param fallbackIndex - This item's position, used to pick a fallback color.
 * @returns The color name to use.
 */
export function resolveThemeColor(
  theme: MantineTheme,
  explicit: string | undefined,
  fallbackIndex: number
): keyof MantineThemeColors {
  if (explicit && Object.hasOwn(theme.colors, explicit)) {
    return explicit;
  }
  return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
}

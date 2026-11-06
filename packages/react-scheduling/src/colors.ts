// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineTheme, MantineThemeColors } from '@mantine/core';
import { getExtensionValue, SchedulingColorURI } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

/**
 * A cycling palette used when nothing more specific names a color, and the palette a visit type's color is
 * chosen from.
 */
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
  'green',
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

/**
 * Picks a fallback color position from a key, so the same key is always given the same
 * color, whatever else there is to color.
 * @param key - What is being colored, such as a resource's reference.
 * @returns A position to pass to `resolveThemeColor` as its `fallbackIndex`.
 */
export function fallbackColorIndex(key: string): number {
  // 32-bit FNV-1a.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Reads the color a resource names for the scheduling calendar, as stored: it may not be a theme color.
 * @param resource - A Schedule or HealthcareService.
 * @returns The color name, if the resource names one.
 */
export function getSchedulingColor(resource: Resource | undefined): string | undefined {
  const color = getExtensionValue(resource, SchedulingColorURI);
  return typeof color === 'string' ? color : undefined;
}

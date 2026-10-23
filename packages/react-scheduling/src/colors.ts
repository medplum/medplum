// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineTheme, MantineThemeColors } from '@mantine/core';
import { convertHsvaTo, isColorValid, parseColor } from '@mantine/core';
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
 * Whether a color is a hex code, `#rgb` or `#rrggbb`, which a SchedulingColor can name in place of a theme color.
 * @param color - The color.
 * @returns True if it is a hex code.
 */
export function isHexColor(color: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color);
}

/**
 * Whether the calendar can draw a color: a hex code, or the name of a real theme color.
 * @param theme - The active Mantine theme.
 * @param color - The color.
 * @returns True if the calendar can draw it.
 */
export function isSchedulingColor(theme: MantineTheme, color: string): boolean {
  return isHexColor(color) || Object.hasOwn(theme.colors, color);
}

/**
 * Resolves the color to render something with: an explicit color if the calendar can draw it,
 * otherwise a color cycled from `FALLBACK_COLORS` by position.
 * @param theme - The active Mantine theme.
 * @param explicit - A color to prefer, if it is a hex code or a real theme color.
 * @param fallbackIndex - This item's position, used to pick a fallback color.
 * @returns The hex code or theme color name to use, which `colorValue` and `colorFill` turn into a color.
 */
export function resolveSchedulingColor(
  theme: MantineTheme,
  explicit: string | undefined,
  fallbackIndex: number
): string {
  if (explicit && isSchedulingColor(theme, explicit)) {
    return explicit;
  }
  return FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
}

/**
 * Picks a fallback color position from a key, so the same key is always given the same
 * color, whatever else there is to color.
 * @param key - What is being colored, such as a resource's reference.
 * @returns A position to pass to `resolveSchedulingColor` as its `fallbackIndex`.
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

/** The shade of a theme color the calendar draws the bar down an appointment's edge in. */
const SHADE = 7;

/**
 * The color a resolved color is drawn in: a hex code as it is, and a theme color in its shade from the theme.
 * @param theme - The active Mantine theme.
 * @param color - A hex code or theme color name, as `resolveSchedulingColor` returns.
 * @returns The color, as the theme writes it.
 */
export function colorValue(theme: MantineTheme, color: string): string {
  return isHexColor(color) ? color : theme.colors[color][SHADE];
}

/**
 * The CSS color MultiCalendar draws a resolved color's bar in, for a key to the calendar such as its legend: a
 * theme color from Mantine's CSS variable, and a hex code kept from blending into the background, as the bar is.
 * @param color - A hex code or theme color name, as `resolveSchedulingColor` returns.
 * @returns The CSS color.
 */
export function colorFill(color: string): string {
  // The lightness bounds are the ones MultiCalendar.module.css holds a `.hex-color` bar to.
  return isHexColor(color)
    ? `light-dark(oklch(from ${color} min(l, 0.9) c h), oklch(from ${color} max(l, 0.4) c h))`
    : `var(--mantine-color-${color}-${SHADE})`;
}

/**
 * The class MultiCalendar's styles pick a resolved color out by. A hex code that a palette color is drawn in is
 * drawn as that color, with the tint and text it is tuned to, so choosing it as a custom color changes nothing.
 * @param theme - The active Mantine theme.
 * @param color - A hex code or theme color name, as `resolveSchedulingColor` returns.
 * @returns The class.
 */
export function colorClass(theme: MantineTheme, color: string): string {
  const name = isHexColor(color)
    ? FALLBACK_COLORS.find((palette) => {
        // A theme may write the shade in another form, as Custom converts it to hex; one Mantine can't read,
        // such as oklch(), matches nothing, rather than the black Mantine reads it as.
        const shade = theme.colors[palette][SHADE];
        return isColorValid(shade) && convertHsvaTo('hex', parseColor(shade)) === color.toLowerCase();
      })
    : color;
  return name ? `color-${name}` : 'hex-color';
}

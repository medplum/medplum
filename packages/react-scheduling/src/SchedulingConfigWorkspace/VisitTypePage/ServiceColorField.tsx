// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CheckIcon, ColorSwatch, getContrastColor, Group, Radio, Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';
import { colorFill, colorValue, FALLBACK_COLORS, fallbackColorIndex, resolveSchedulingColor } from '../../colors';

export interface ServiceColorFieldProps {
  /** The color the visit type names, a Mantine color or a hex code, or undefined to leave the calendar to pick one. */
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
  /** The visit type's reference, which the calendar picks its color from when it names none. Absent until saved. */
  readonly serviceReference?: string;
}

/**
 * Picks the color the scheduling calendar draws a visit type's appointments in, from the calendar's palette.
 * @param props - The color named, a change handler, and the visit type's reference.
 * @returns The field.
 */
export function ServiceColorField(props: ServiceColorFieldProps): JSX.Element {
  const { value, onChange, serviceReference } = props;
  const theme = useMantineTheme();
  // The calendar picks a color by the visit type's reference when it names none, or one it can't draw. A new
  // visit type has no reference yet, so the palette's first color stands in.
  const fallbackIndex = serviceReference ? fallbackColorIndex(serviceReference) : 0;
  // Resolve the "automatic" color to display inside that button
  const automaticColor = serviceReference && resolveSchedulingColor(theme, undefined, fallbackIndex);
  // A color stored by another tool that the palette doesn't hold is offered too, so it isn't read as Automatic.
  const palette: readonly string[] = FALLBACK_COLORS;
  const colors = value && !palette.includes(value) ? [...palette, value] : palette;
  const checkColor = (color: string): string =>
    getContrastColor({ color: colorValue(theme, color), theme, autoContrast: true });

  return (
    <Radio.Group
      label="Calendar color"
      description="What the scheduling calendar draws this visit type's appointments in."
      value={value ?? ''}
      onChange={(next) => onChange(next || undefined)}
    >
      <Group gap="xs" mt="xs">
        <Radio.Card value="" w="auto" radius="xl" px="sm" py={4}>
          <Group gap={6} wrap="nowrap">
            {automaticColor ? (
              <ColorSwatch
                color={colorFill(automaticColor)}
                size={18}
                withShadow={false}
                c={checkColor(automaticColor)}
              >
                {!value && <CheckIcon size={8} />}
              </ColorSwatch>
            ) : (
              !value && <CheckIcon size={10} />
            )}
            <Text size="sm">Automatic</Text>
          </Group>
        </Radio.Card>
        {colors.map((color) => {
          // A stored color the calendar can't draw, such as another tool's, is shown as the calendar draws it.
          const drawn = resolveSchedulingColor(theme, color, fallbackIndex);
          return (
            <Radio.Card key={color} value={color} aria-label={color} w="auto" radius="xl" withBorder={false}>
              <ColorSwatch color={colorFill(drawn)} size={28} withShadow={false} c={checkColor(drawn)}>
                {value === color && <CheckIcon size={12} />}
              </ColorSwatch>
            </Radio.Card>
          );
        })}
      </Group>
    </Radio.Group>
  );
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { CheckIcon, ColorSwatch, getContrastColor, Group, Radio, Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';
import { FALLBACK_COLORS, fallbackColorIndex, resolveThemeColor } from '../../colors';

export interface ServiceColorFieldProps {
  /** The Mantine color the visit type names, or undefined to leave the calendar to pick one. */
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
  // Resolve the "automatic" color to display inside that button
  const automaticColor = serviceReference && resolveThemeColor(theme, undefined, fallbackColorIndex(serviceReference));
  // A color stored by another tool that the palette doesn't hold is offered too, so it isn't read as Automatic.
  const palette: readonly string[] = FALLBACK_COLORS;
  const colors = value && !palette.includes(value) ? [...palette, value] : palette;
  const checkColor = (color: string): string => getContrastColor({ color: `${color}.7`, theme, autoContrast: true });

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
                color={`var(--mantine-color-${automaticColor}-7)`}
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
        {colors.map((color) => (
          <Radio.Card key={color} value={color} aria-label={color} w="auto" radius="xl" withBorder={false}>
            <ColorSwatch color={`var(--mantine-color-${color}-7)`} size={28} withShadow={false} c={checkColor(color)}>
              {value === color && <CheckIcon size={12} />}
            </ColorSwatch>
          </Radio.Card>
        ))}
      </Group>
    </Radio.Group>
  );
}

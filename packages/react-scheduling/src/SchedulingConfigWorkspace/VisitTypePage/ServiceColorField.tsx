// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CheckIcon,
  ColorInput,
  ColorSwatch,
  convertHsvaTo,
  getContrastColor,
  Group,
  parseColor,
  Radio,
  Text,
  useMantineTheme,
} from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  colorFill,
  colorValue,
  FALLBACK_COLORS,
  fallbackColorIndex,
  isHexColor,
  resolveSchedulingColor,
} from '../../colors';
import { AppointmentColorPreview } from '../../MultiCalendar/AppointmentColorPreview';

export interface ServiceColorFieldProps {
  /** The color the visit type names, a Mantine color or a hex code, or undefined to leave the calendar to pick one. */
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
  /** The visit type's reference, which the calendar picks its color from when it names none. Absent until saved. */
  readonly serviceReference?: string;
  /** The visit type's name, which a custom color's preview is titled with. */
  readonly serviceName: string;
}

const CUSTOM = 'custom';

/**
 * Picks the color the scheduling calendar draws a visit type's appointments in, from the calendar's palette
 * or as a custom hex code.
 * @param props - The color named, a change handler, and the visit type's reference.
 * @returns The field.
 */
export function ServiceColorField(props: ServiceColorFieldProps): JSX.Element {
  const { value, onChange, serviceReference, serviceName } = props;
  const theme = useMantineTheme();
  // The calendar picks a color by the visit type's reference when it names none, or one it can't draw. A new
  // visit type has no reference yet, so the palette's first color stands in.
  const fallbackIndex = serviceReference ? fallbackColorIndex(serviceReference) : 0;
  // Resolve the "automatic" color to display inside that button
  const automaticColor = serviceReference && resolveSchedulingColor(theme, undefined, fallbackIndex);
  // A color stored by another tool that the palette doesn't hold is offered too, so it isn't read as Automatic.
  const palette: readonly string[] = FALLBACK_COLORS;
  const custom = value && isHexColor(value) ? value : undefined;
  const colors = value && !custom && !palette.includes(value) ? [...palette, value] : palette;
  // A partial code, held until it's a whole #rrggbb, and dropped if the input blurs first.
  const [typed, setTyped] = useState<string>();
  const checkColor = (color: string): string =>
    getContrastColor({ color: colorValue(theme, color), theme, autoContrast: true });

  return (
    <Radio.Group
      label="Calendar color"
      description="What the scheduling calendar draws this visit type's appointments in."
      value={custom ? CUSTOM : (value ?? '')}
      onChange={(next) => {
        if (next === CUSTOM) {
          // Starts from the color shown now, as hex though a theme may write it in another form. Mantine reads a
          // form it can't, such as oklch(), as black.
          const shown = colorValue(theme, resolveSchedulingColor(theme, value, fallbackIndex));
          onChange(convertHsvaTo('hex', parseColor(shown)));
        } else {
          onChange(next || undefined);
        }
      }}
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
        <Radio.Card value={CUSTOM} w="auto" radius="xl" px="sm" py={4}>
          <Group gap={6} wrap="nowrap">
            {custom && (
              <ColorSwatch color={custom} size={18} withShadow={false} c={checkColor(custom)}>
                <CheckIcon size={8} />
              </ColorSwatch>
            )}
            <Text size="sm">Custom</Text>
          </Group>
        </Radio.Card>
      </Group>
      {custom && (
        <Group gap="md" mt="xs" align="center">
          <ColorInput
            aria-label="Custom color"
            format="hex"
            w={180}
            withEyeDropper={false}
            // Mantine's own fix on blur would store the last code it could read along the way, such as #228 of
            // #228b22, in place of an unfinished one.
            fixOnBlur={false}
            value={typed ?? custom}
            onChange={(next) => {
              // Spaces pasted around a code are dropped, and a shorter code may be the start of a #rrggbb.
              const code = next.trim();
              if (/^#?[0-9a-f]{6}$/i.test(code)) {
                setTyped(undefined);
                onChange(code.startsWith('#') ? code : `#${code}`);
              } else {
                setTyped(next);
              }
            }}
            onBlur={() => setTyped(undefined)}
          />
          <AppointmentColorPreview color={custom} title={serviceName} colorScheme="light" />
          <AppointmentColorPreview color={custom} title={serviceName} colorScheme="dark" />
        </Group>
      )}
    </Radio.Group>
  );
}

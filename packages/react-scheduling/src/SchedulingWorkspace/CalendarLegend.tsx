// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MantineThemeColors } from '@mantine/core';
import { ColorSwatch, Divider, Group, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Appointment } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { ServiceTypeDisplay } from '../ServiceTypeDisplay';

/** A service type the calendar draws appointments for, and the color it draws them in. */
export interface ServiceTypeLegendItem {
  readonly id: string;
  /** An appointment of the service type, which it is named by. */
  readonly appointment: Appointment;
  readonly color: keyof MantineThemeColors;
}

export interface CalendarLegendProps {
  /** The service types on show, in the order to list them. */
  readonly serviceTypes: readonly ServiceTypeLegendItem[];
  readonly className?: string;
}

/** How many service types' colors the trigger hints at. */
const PREVIEW_COUNT = 4;

/**
 * The shade MultiCalendar fills appointments with.
 * @param color - The service type's color.
 * @returns The CSS color.
 */
function fill(color: keyof MantineThemeColors): string {
  return `var(--mantine-color-${color}-7)`;
}

/**
 * The key to the calendar's colors, opened from a small trigger.
 *
 * It opens on hover, as a tooltip would, and on focus or a click, so keyboard and touch
 * reach it too.
 *
 * @param props - The React props.
 * @returns The trigger, with the key in a popover above it.
 */
export function CalendarLegend(props: CalendarLegendProps): JSX.Element {
  const { serviceTypes, className } = props;
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Popover opened={opened} onDismiss={close} position="top-end" shadow="md" withArrow>
      <Popover.Target>
        <UnstyledButton
          className={className}
          onMouseEnter={open}
          onMouseLeave={close}
          onFocus={open}
          onBlur={close}
          onClick={open}
          // Mantine listens for Escape only inside the popover, and focus stays here.
          onKeyDown={(event) => event.key === 'Escape' && close()}
        >
          <Group gap={6} wrap="nowrap">
            <Group gap={0} wrap="nowrap" aria-hidden="true">
              {serviceTypes.slice(0, PREVIEW_COUNT).map((serviceType, index) => (
                <ColorSwatch
                  key={serviceType.id}
                  color={fill(serviceType.color)}
                  size={10}
                  withShadow={false}
                  ml={index > 0 ? -3 : 0}
                  style={{ border: '1px solid var(--mantine-color-body)' }}
                />
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              Legend
            </Text>
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown miw={220}>
        <Stack gap={6}>
          {serviceTypes.length > 0 && (
            <>
              <Text size="sm" fw={500}>
                Service types
              </Text>
              {serviceTypes.map((serviceType) => (
                <Group key={serviceType.id} gap="xs" wrap="nowrap">
                  <ColorSwatch color={fill(serviceType.color)} size={14} radius="sm" withShadow={false} />
                  <Text size="sm">
                    <ServiceTypeDisplay appointment={serviceType.appointment} inherit />
                  </Text>
                </Group>
              ))}
              <Divider />
            </>
          )}
          <Text size="xs" c="dimmed">
            Shaded time is a calendar&apos;s availability, in its sidebar color.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

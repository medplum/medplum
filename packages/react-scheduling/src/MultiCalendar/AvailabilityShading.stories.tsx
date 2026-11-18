// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Checkbox, ColorSwatch, Group, Select, Stack, Text, useMantineTheme } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getReferenceString, serviceTypeOffersService } from '@medplum/core';
import type { HealthcareService, Location } from '@medplum/fhirtypes';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { AvailabilityShading } from '../availabilityShading';
import { computeAvailabilityShading } from '../availabilityShading';
import { fallbackColorIndex, getSchedulingColor, resolveThemeColor } from '../colors';
import { groupAppointmentsByService, matchesCalendarFilters } from '../SchedulingWorkspace/SchedulingWorkspace.utils';
import type { ShadingProvider } from '../stories/availabilityShading';
import {
  alvarez,
  bennett,
  chen,
  dalton,
  injections,
  newPatient,
  riverside,
  SHADING_APPOINTMENTS,
  SHADING_FACILITIES,
  SHADING_FIXTURES,
  SHADING_PROVIDERS,
  SHADING_SLOTS,
  SHADING_VISIT_TYPES,
} from '../stories/availabilityShading';
import { withFixtures, withMockedDate } from '../stories/decorators';
import type { DateTimeRange } from '../types';
import type { MultiCalendarSource } from './MultiCalendar';
import { MultiCalendar } from './MultiCalendar';

/*
 * A prototype of availability colors on the scheduling calendar: colored blocks behind the appointments
 * that say when a provider can take each visit type. Each story opens on one case, and the filters stay
 * live. The data is made up, and windows scoped to a service facility are not something scheduling has
 * today; see `availabilityShading.ts`.
 */
export default {
  title: 'Medplum/AvailabilityShading',
  component: MultiCalendar,
  decorators: [withFixtures(SHADING_FIXTURES), withMockedDate],
} as Meta;

interface DemoProps {
  /** What to look at in this story. */
  readonly note: string;
  /** The service facility the filter starts on, or none for all of them. */
  readonly facility?: WithId<Location>;
  /** The visit type the filter starts on, or none for all of them. */
  readonly service?: WithId<HealthcareService>;
  /** The providers whose calendars start switched on. */
  readonly providers: readonly ShadingProvider[];
}

interface LegendItem {
  readonly color: string;
  readonly names: string;
}

/**
 * Why the filters leave a provider's calendar out, as the workspace would.
 * @param provider - The provider.
 * @param facility - The chosen service facility, if any.
 * @param service - The chosen visit type, if any.
 * @returns The reason, or undefined for a provider the filters keep.
 */
function exclusionReason(
  provider: ShadingProvider,
  facility: WithId<Location> | undefined,
  service: WithId<HealthcareService> | undefined
): string | undefined {
  if (facility && !provider.facilities.includes(facility)) {
    return `Not at ${facility.name}`;
  }
  if (service && !serviceTypeOffersService(provider.schedule.serviceType, service)) {
    return `Does not offer ${service.name}`;
  }
  return undefined;
}

function describeShading(
  shading: AvailabilityShading | undefined,
  shown: readonly ShadingProvider[],
  facility: WithId<Location> | undefined,
  service: WithId<HealthcareService> | undefined
): { off: boolean; message: string } {
  const where = facility ? ` at ${facility.name}` : ' across all facilities';
  const name = (provider: ShadingProvider): string => `Dr. ${provider.practitioner.name?.[0].family}`;
  if (!shown.length) {
    return { off: true, message: 'No calendars are shown. Turn on a provider under Calendars.' };
  }
  if (service) {
    const who = shown.length > 1 ? `any of ${shown.length} providers` : name(shown[0]);
    const hint = shown.length > 1 ? ' Hover a block to see who is available.' : '';
    return { off: false, message: `${service.name} availability for ${who}${where}.${hint}` };
  }
  if (shown.length > 1) {
    return {
      off: true,
      message: 'Availability colors are off. Select a visit type or show a single provider to see them.',
    };
  }
  if (shading && !shading.shades.length) {
    return {
      off: false,
      message: `${name(shown[0])} has no availability windows of their own${where}. Select a visit type to see the default hours they inherit.`,
    };
  }
  return { off: false, message: `${name(shown[0])}’s availability by visit type${where}.` };
}

/**
 * Holds the demo's filters and works out what the calendar draws for them: the appointments the filters
 * leave, by visit type color, and the availability blocks behind them.
 * @param initial - What the filters start on.
 * @returns The filters with their setters, and what to hand the calendar, the status line and the legend.
 */
function useAvailabilityShadingDemo(initial: DemoProps): {
  facility: WithId<Location> | undefined;
  setFacility: (facility: WithId<Location> | undefined) => void;
  service: WithId<HealthcareService> | undefined;
  setService: (service: WithId<HealthcareService> | undefined) => void;
  switchedOn: ReadonlySet<ShadingProvider>;
  toggle: (provider: ShadingProvider, on: boolean) => void;
  setRange: (range: DateTimeRange) => void;
  sources: MultiCalendarSource[];
  shading: AvailabilityShading | undefined;
  status: { off: boolean; message: string };
  legend: LegendItem[];
} {
  const theme = useMantineTheme();
  const [facility, setFacility] = useState(initial.facility);
  const [service, setService] = useState(initial.service);
  const [switchedOn, setSwitchedOn] = useState<ReadonlySet<ShadingProvider>>(() => new Set(initial.providers));
  const [range, setRange] = useState<DateTimeRange>();

  const toggle = useCallback((provider: ShadingProvider, on: boolean): void => {
    setSwitchedOn((current) => {
      const next = new Set(current);
      if (on) {
        next.add(provider);
      } else {
        next.delete(provider);
      }
      return next;
    });
  }, []);

  const colorOf = useCallback(
    (visitType: WithId<HealthcareService>) =>
      resolveThemeColor(theme, getSchedulingColor(visitType), fallbackColorIndex(getReferenceString(visitType))),
    [theme]
  );

  const derived = useMemo(() => {
    const filters = { serviceFacility: facility, service };
    const shown = SHADING_PROVIDERS.filter(
      (provider) => switchedOn.has(provider) && !exclusionReason(provider, facility, service)
    );
    const heldBy = (provider: ShadingProvider): typeof SHADING_APPOINTMENTS =>
      SHADING_APPOINTMENTS.filter((appointment) =>
        appointment.participant.some(
          (participant) => participant.actor?.reference === getReferenceString(provider.practitioner)
        )
      );
    const blockedOn = (provider: ShadingProvider): typeof SHADING_SLOTS =>
      SHADING_SLOTS.filter((slot) => slot.schedule.reference === getReferenceString(provider.schedule));

    // As the workspace draws them: blocked time on its calendar, appointments by visit type color.
    const drawn = shown.flatMap(heldBy).filter((appointment) =>
      matchesCalendarFilters(appointment, {
        serviceFacilities: facility ? [facility] : [],
        services: service ? [service] : [],
      })
    );
    const sources: MultiCalendarSource[] = [
      ...shown.map((provider) => ({ schedule: provider.schedule, slots: blockedOn(provider), appointments: [] })),
      ...Array.from(groupAppointmentsByService(drawn), ([reference, appointments]) => ({
        color: colorOf(
          SHADING_VISIT_TYPES.find((visitType) => getReferenceString(visitType) === reference) ?? newPatient
        ),
        slots: [],
        appointments,
      })),
    ];

    const shading =
      range &&
      computeAvailabilityShading({
        calendars: shown.map((provider) => ({
          schedule: provider.schedule,
          appointments: heldBy(provider),
          slots: blockedOn(provider),
        })),
        services: SHADING_VISIT_TYPES,
        filters,
        range,
        colorOf,
      });

    const colors = [...new Set(shading?.shades.flatMap((shade) => shade.color ?? []))];
    const legend = colors.map((color): LegendItem => {
      const names = shading?.shades
        .filter((shade) => shade.color === color)
        .flatMap((shade) => shade.details.map((detail) => detail.service.name));
      return { color, names: [...new Set(names)].join(', ') };
    });

    return { sources, shading, legend, status: describeShading(shading, shown, facility, service) };
  }, [facility, service, switchedOn, range, colorOf]);

  return { facility, setFacility, service, setService, switchedOn, toggle, setRange, ...derived };
}

function AvailabilityShadingDemo(props: DemoProps): JSX.Element {
  const demo = useAvailabilityShadingDemo(props);
  const { facility, service } = demo;

  return (
    <Stack gap="sm" p="md">
      <Text maw={860}>{props.note}</Text>
      <Group align="flex-start" wrap="nowrap" gap="lg">
        <Stack w={240} gap="md" style={{ flexShrink: 0 }}>
          <Select
            label="Service Facility"
            placeholder="All facilities"
            clearable
            data={SHADING_FACILITIES.map((item) => ({ value: item.id, label: item.name ?? item.id }))}
            value={facility?.id ?? null}
            onChange={(id) => demo.setFacility(SHADING_FACILITIES.find((item) => item.id === id))}
          />
          <Select
            label="Visit Type"
            placeholder="Any visit type"
            clearable
            data={SHADING_VISIT_TYPES.map((item) => ({ value: item.id, label: item.name ?? item.id }))}
            value={service?.id ?? null}
            onChange={(id) => demo.setService(SHADING_VISIT_TYPES.find((item) => item.id === id))}
          />
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Calendars
            </Text>
            {SHADING_PROVIDERS.map((provider) => (
              <Checkbox
                key={provider.schedule.id}
                label={`Dr. ${provider.practitioner.name?.[0].family}`}
                description={exclusionReason(provider, facility, service)}
                checked={demo.switchedOn.has(provider)}
                onChange={(event) => demo.toggle(provider, event.currentTarget.checked)}
              />
            ))}
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Availability
            </Text>
            {demo.legend.map((item) => (
              <Group key={item.color} gap="xs" wrap="nowrap">
                <ColorSwatch color={`var(--mantine-color-${item.color}-3)`} size={14} radius={0} withShadow={false} />
                <Text size="sm">{item.names}</Text>
              </Group>
            ))}
            {!demo.legend.length && (
              <Text size="sm" c="dimmed">
                Nothing drawn.
              </Text>
            )}
          </Stack>
        </Stack>
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          <Alert variant={demo.status.off ? 'outline' : 'light'} color="gray" p="xs">
            {demo.status.message}
          </Alert>
          <div style={{ height: 900 }}>
            <MultiCalendar
              sources={demo.sources}
              availabilityShading={demo.shading?.shades}
              onRangeChange={demo.setRange}
            />
          </div>
        </Stack>
      </Group>
    </Stack>
  );
}

export const OneProviderOneFacility = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Dr. Alvarez at Riverside Clinic takes New Patient visits 9–12 and Follow-ups 12–4 on Monday, Wednesday and Friday. Tuesday and Thursday are empty because those hours belong to Northgate Hospital."
    facility={riverside}
    providers={[alvarez]}
  />
);

export const VisitTypeFilter = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Selecting New Patient leaves only the green blocks. The filter also hides Follow-up appointments, as it does in the workspace today."
    facility={riverside}
    service={newPatient}
    providers={[alvarez]}
  />
);

export const TwoProvidersOneVisitType = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Dr. Bennett takes New Patient visits 12–4. Green now covers every time either provider can take one. Hover a block to see who. Thursday afternoon stops at 2 because Dr. Bennett has time off."
    facility={riverside}
    service={newPatient}
    providers={[alvarez, bennett]}
  />
);

export const OverlappingVisitTypes = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Dr. Chen’s windows overlap. Different colors sit side by side (Monday, Wednesday). New Patient and Consult share green, so Tuesday morning is one block. Thursday afternoon has five visit types, so two collapse into “+2”."
    facility={riverside}
    providers={[chen]}
  />
);

export const TwoFacilities = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="With no facility selected, every window shows and each is tagged with its facility. Select Northgate Hospital to see only Tuesday and Thursday."
    providers={[alvarez]}
  />
);

export const HiddenAppointment = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Dr. Chen has a Procedures appointment at 10:30 on Monday. The Injections filter hides it, so the orange is cut out there and does not show that time as open. Clear the visit type to see the appointment."
    facility={riverside}
    service={injections}
    providers={[chen]}
  />
);

export const SeveralProvidersNoVisitType = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Three providers and no visit type would mean every color for everyone at once. Colors turn off, and the calendar says how to bring them back."
    facility={riverside}
    providers={[alvarez, bennett, chen]}
  />
);

export const InheritedDefaultHours = (): JSX.Element => (
  <AvailabilityShadingDemo
    note="Dr. Dalton has no windows of their own and inherits each visit type’s default hours. Those stay hidden until a visit type is selected. Pick New Patient to see them."
    facility={riverside}
    providers={[dalton]}
  />
);

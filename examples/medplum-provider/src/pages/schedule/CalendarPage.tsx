// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Group, LoadingOverlay, SegmentedControl, Select, Stack, Text, Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString, isReference } from '@medplum/core';
import type { Appointment, HealthcareService, ResourceType, Schedule } from '@medplum/fhirtypes';
import { ResourceInput, useMedplum } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconCalendarWeek, IconClockHour4 } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AvailabilityManager } from '../../components/schedule/AvailabilityManager';
import type { CalendarFilters } from '../../components/schedule/CalendarFilterPanel';
import { CalendarFilterPanel, defaultCalendarFilters } from '../../components/schedule/CalendarFilterPanel';
import type { CalendarEntry, LegendItem } from '../../components/schedule/ResourceCalendar';
import { ResourceCalendar } from '../../components/schedule/ResourceCalendar';
import { SessionDetailsPanel } from '../../components/schedule/SessionDetailsPanel';
import { getScheduleActorRef, useActorLabels } from '../../hooks/useActorLabels';
import { useActorAppointmentsAndSlots } from '../../hooks/useActorAppointmentsAndSlots';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import type { Range } from '../../types/scheduling';
import { filterStandaloneBlocks } from '../../utils/scheduling';
import { extractReferencesFromCodeableReferenceLike } from '../../utils/servicetype';
import classes from './CalendarPage.module.css';

type ScreenMode = 'calendar' | 'availability';

// Group every Schedule by its actor's resourceType (no service-eligibility
// filter — the roster is visit-type-agnostic). Drives both the View-by lens
// options and the availability actor picker.
function groupAllSchedulesByActorType(schedules: Schedule[]): Partial<Record<ResourceType, WithId<Schedule>[]>> {
  const pools: Partial<Record<ResourceType, WithId<Schedule>[]>> = {};
  for (const schedule of schedules) {
    if (!schedule.id) {
      continue;
    }
    for (const actorRef of schedule.actor) {
      const actorType = actorRef.reference?.split('/')[0] as ResourceType | undefined;
      if (!actorType) {
        continue;
      }
      const pool = pools[actorType] ?? [];
      pool.push(schedule as WithId<Schedule>);
      pools[actorType] = pool;
    }
  }
  return pools;
}

// Coarse time-of-day bucket from a clicked hour, mapped to Find & Book's
// existing `timeOfDay` criteria — the calendar click pre-fills a *search*,
// never an appointment, so no visit-type rule (duration/buffer/alignment)
// can be violated.
function timeOfDayBucket(date: Date): 'morning' | 'afternoon' | 'any' {
  const hour = date.getHours();
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 24) {
    return 'afternoon';
  }
  return 'any';
}

/**
 * Calendar & Availability Management screen (spec, screen #2 of 3) — a new
 * route, purely additive alongside the existing `/Calendar/Schedule` and
 * `/Scheduling` pages. Calendar mode is an overlaid multi-actor roster
 * (color-per-actor, status as overlay); Availability mode is provider hours
 * management (weekly template + one-time blocks). The calendar never books
 * directly — empty-space clicks and reschedule both route through Find &
 * Book so visit-type rules and atomic multi-resource booking are always
 * enforced (spec §6 load-bearing principle).
 * @returns The Calendar & Availability screen element.
 */
export function CalendarPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<ScreenMode>('calendar');
  const [filters, setFilters] = useState<CalendarFilters>(() => defaultCalendarFilters());
  const [calendarRange, setCalendarRange] = useState<Range>();
  const [selectedAppointment, setSelectedAppointment] = useState<WithId<Appointment>>();
  const [detailsOpened, detailsHandlers] = useDisclosure(false);

  // Availability-mode state
  const [availabilityActorRef, setAvailabilityActorRef] = useState<string | null>(null);
  const [availabilityVisitType, setAvailabilityVisitType] = useState<WithId<HealthcareService>>();
  const [availabilityRange, setAvailabilityRange] = useState<Range>();
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);

  const [allSchedules, allSchedulesLoading, allSchedulesOutcome] = useSearchResources<'Schedule'>('Schedule', {
    _count: 100,
  });
  useNotifyOnError(allSchedulesOutcome);

  const pools = useMemo(() => groupAllSchedulesByActorType(allSchedules ?? []), [allSchedules]);
  const actorLabels = useActorLabels(pools);

  // Optional pre-fill from the Configuration screen's "set hours" link-out
  // (Providers & Resources tab): jumps straight to Availability mode with
  // that provider pre-selected. Additive — absent on the normal Calendar
  // entry point, so nothing changes there.
  useEffect(() => {
    if (searchParams.get('mode') === 'availability') {
      setMode('availability');
      const actor = searchParams.get('actor');
      if (actor) {
        setAvailabilityActorRef(actor);
      }
    }
    // Consult the URL once, on mount — the page's own controls own state after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Calendar mode ----
  const visibleSchedules = useMemo(() => {
    const columnPool = pools[filters.columnMode] ?? [];
    return filters.selectedActorRefs.length === 0
      ? columnPool
      : columnPool.filter((s) => {
          const ref = getScheduleActorRef(s);
          return ref && filters.selectedActorRefs.includes(ref);
        });
  }, [pools, filters.columnMode, filters.selectedActorRefs]);

  // Each visible actor gets a stable palette index by position.
  const visibleActors = useMemo(
    () =>
      visibleSchedules
        .map((s, i) => {
          const ref = getScheduleActorRef(s);
          return ref ? { ref, label: actorLabels.get(ref) ?? ref, colorIndex: i, schedule: s } : undefined;
        })
        .filter((a): a is { ref: string; label: string; colorIndex: number; schedule: WithId<Schedule> } => !!a),
    [visibleSchedules, actorLabels]
  );

  const { appointments, slots, loading: dataLoading } = useActorAppointmentsAndSlots({
    schedules: mode === 'calendar' ? visibleSchedules : [],
    range: calendarRange,
  });

  const filteredAppointments = useMemo(
    () => (filters.statuses.length === 0 ? appointments : appointments.filter((a) => filters.statuses.includes(a.status))),
    [appointments, filters.statuses]
  );

  // Color each appointment by the visible actor (of the current lens type) it
  // belongs to. In Provider lens that's the provider; in Room lens the room.
  const entries: CalendarEntry[] = useMemo(() => {
    const byRef = new Map(visibleActors.map((a) => [a.ref, a.colorIndex]));
    const result: CalendarEntry[] = [];
    for (const appointment of filteredAppointments) {
      const match = appointment.participant.find((p) => {
        const ref = p.actor && getReferenceString(p.actor);
        return ref && byRef.has(ref);
      });
      const ref = match?.actor && getReferenceString(match.actor);
      if (ref !== undefined && byRef.has(ref)) {
        result.push({ appointment, colorIndex: byRef.get(ref) as number });
      }
    }
    return result;
  }, [filteredAppointments, visibleActors]);

  // Standalone busy-unavailable blocks (OOO/holiday) shown as background on
  // the roster — excludes buffer-before/after Slots that $book/$hold persist
  // as a side effect of each appointment's own buffers (spec §4.5 revised).
  const rosterBlocks = useMemo(() => filterStandaloneBlocks(slots, appointments), [slots, appointments]);

  const legend: LegendItem[] = useMemo(
    () => visibleActors.map((a) => ({ label: a.label, colorIndex: a.colorIndex })),
    [visibleActors]
  );

  // ---- Availability mode ----
  // Provider-only: recurring-hours self-service is a provider concept, and
  // Room/Device availability configuration lives in the Configuration
  // screen's own (non-visual) form editor, not this provider-facing calendar.
  const availabilityActor = useMemo(() => {
    const providers = pools.Practitioner ?? [];
    const chosen = providers.find((s) => getScheduleActorRef(s) === availabilityActorRef) ?? providers[0];
    if (!chosen) {
      return undefined;
    }
    const ref = getScheduleActorRef(chosen);
    return ref ? { ref, label: actorLabels.get(ref) ?? ref, schedule: chosen } : undefined;
  }, [pools, availabilityActorRef, actorLabels]);

  const availabilityActorOptions = useMemo(
    () =>
      (pools.Practitioner ?? [])
        .map((s) => getScheduleActorRef(s))
        .filter((ref): ref is string => !!ref)
        .map((ref) => ({ value: ref, label: actorLabels.get(ref) ?? ref })),
    [pools, actorLabels]
  );

  const serviceRefsForSchedule = useMemo(
    () =>
      availabilityActor
        ? extractReferencesFromCodeableReferenceLike(availabilityActor.schedule.serviceType)
            .map((r) => r.reference)
            .filter((r): r is string => !!r)
        : [],
    [availabilityActor]
  );

  const availabilityData = useActorAppointmentsAndSlots({
    schedules: mode === 'availability' && availabilityActor ? [availabilityActor.schedule] : [],
    range: availabilityRange,
    refreshToken: availabilityRefresh,
  });
  const availabilityBlocks = useMemo(
    () => filterStandaloneBlocks(availabilityData.slots, availabilityData.appointments),
    [availabilityData.slots, availabilityData.appointments]
  );

  // ---- Actions ----
  const handleClickEmptySlot = async (date: Date): Promise<void> => {
    const params = new URLSearchParams();
    params.set('date', date.toISOString().slice(0, 10));
    params.set('timeOfDay', timeOfDayBucket(date));
    // Overlay has no per-actor columns, so a click can't identify an actor.
    // Only pin one when the filter is already narrowed to exactly one actor
    // of the current lens — otherwise leave it "any" and let the admin pick.
    if (visibleActors.length === 1) {
      const fieldByMode: Record<typeof filters.columnMode, string> = {
        Practitioner: 'provider',
        Location: 'room',
        Device: 'device',
      };
      params.set(fieldByMode[filters.columnMode], visibleActors[0].ref);
    }
    await navigate(`/Scheduling?${params.toString()}`);
  };

  const handleReschedule = async (appointment: WithId<Appointment>): Promise<void> => {
    // Defer-cancel: do NOT cancel here. Carry the original appointment id to
    // Find & Book; it cancels the original only after a new booking succeeds,
    // so an abandoned reschedule leaves the original intact.
    const serviceRefs = extractReferencesFromCodeableReferenceLike(appointment.serviceType);
    const patientParticipant = appointment.participant.find((p) => isReference(p.actor, 'Patient'));
    const params = new URLSearchParams();
    if (serviceRefs[0]?.reference) {
      params.set('healthcareService', serviceRefs[0].reference);
    }
    if (patientParticipant?.actor?.reference) {
      params.set('patient', patientParticipant.actor.reference);
    }
    params.set('reschedule', getReferenceString(appointment));
    detailsHandlers.close();
    await navigate(`/Scheduling?${params.toString()}`);
  };

  return (
    <div className={classes.container}>
      <Box className={classes.filterPanel}>
        <Stack gap="md">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(value) => setMode(value as ScreenMode)}
            data={[
              {
                value: 'calendar',
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <IconCalendarWeek size={16} />
                    <span>Calendar</span>
                  </Group>
                ),
              },
              {
                value: 'availability',
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <IconClockHour4 size={16} />
                    <span>Availability</span>
                  </Group>
                ),
              },
            ]}
          />

          {mode === 'calendar' && <CalendarFilterPanel pools={pools} filters={filters} onChange={setFilters} />}

          {mode === 'availability' && (
            <Stack gap="sm">
              <Select
                label="Provider"
                data={availabilityActorOptions}
                value={availabilityActor?.ref ?? null}
                onChange={setAvailabilityActorRef}
              />
              <Box>
                <Text size="sm" fw={500} mb={4}>
                  Visit type
                </Text>
                <ResourceInput<WithId<HealthcareService>>
                  name="availability-visit-type"
                  resourceType="HealthcareService"
                  defaultValue={availabilityVisitType}
                  onChange={setAvailabilityVisitType}
                  placeholder="Select a visit type"
                />
              </Box>
            </Stack>
          )}
        </Stack>
      </Box>

      <Stack className={classes.main} gap="sm" pos="relative">
        <LoadingOverlay visible={allSchedulesLoading || dataLoading} />

        {mode === 'calendar' && (
          <>
            {visibleActors.length === 0 && <Alert color="yellow">No actors match the current filters.</Alert>}
            {visibleActors.length > 0 && (
              <ResourceCalendar
                entries={entries}
                blocks={rosterBlocks}
                legend={legend}
                actorKind={filters.columnMode}
                slotDurationMinutes={30}
                initialView="timeGridWeek"
                onRangeChange={setCalendarRange}
                onCreateAt={handleClickEmptySlot}
                onSelectAppointment={(appointment) => {
                  setSelectedAppointment(appointment);
                  detailsHandlers.open();
                }}
              />
            )}
          </>
        )}

        {mode === 'availability' && (
          <>
            {!availabilityVisitType && (
              <Alert color="blue">Select a visit type in the left panel to view and edit recurring hours.</Alert>
            )}
            {availabilityActor && availabilityVisitType && (
              <AvailabilityManager
                key={`${availabilityActor.ref}-${availabilityVisitType.id}`}
                schedule={availabilityActor.schedule}
                actorLabel={availabilityActor.label}
                visitType={availabilityVisitType}
                serviceRefsForSchedule={serviceRefsForSchedule}
                allSchedules={allSchedules ?? []}
                blocks={availabilityBlocks}
                blocksRange={availabilityRange}
                onBlocksRangeChange={setAvailabilityRange}
                onRefresh={() => setAvailabilityRefresh((n) => n + 1)}
              />
            )}
          </>
        )}
      </Stack>

      <Drawer opened={detailsOpened} onClose={detailsHandlers.close} title="Session Details" position="right" size="md">
        {selectedAppointment && (
          <SessionDetailsPanel
            appointment={selectedAppointment}
            onUpdate={(updated) => {
              setSelectedAppointment(updated);
              medplum.invalidateSearches('Appointment');
              medplum.invalidateSearches('Slot');
            }}
            onReschedule={handleReschedule}
          />
        )}
      </Drawer>
    </div>
  );
}

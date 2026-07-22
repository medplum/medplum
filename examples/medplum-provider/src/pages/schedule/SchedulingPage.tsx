// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Drawer, Grid, Group, LoadingOverlay, Paper, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { HealthcareService, Patient, Reference, ResourceType, Schedule } from '@medplum/fhirtypes';
import { ResourceInput, useMedplum } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconCalendarSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookAppointmentForm } from '../../components/schedule/BookAppointmentForm';
import type { BookingConfirmedResult } from '../../components/schedule/BookingConfirmedModal';
import { BookingConfirmedModal } from '../../components/schedule/BookingConfirmedModal';
import type { Criteria } from '../../components/schedule/CriteriaPanel';
import { CriteriaPanel } from '../../components/schedule/CriteriaPanel';
import { MonthCalendar } from '../../components/schedule/MonthCalendar';
import { SlotList } from '../../components/schedule/SlotList';
import { useActorLabels, getScheduleActorRef } from '../../hooks/useActorLabels';
import type { ComboSlot } from '../../hooks/useMultiResourceFind';
import { useMultiResourceFind } from '../../hooks/useMultiResourceFind';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import { useSchedulingStartsAt } from '../../hooks/useSchedulingStartsAt';
import { cartesianCombos, localDayKey, resolveResourcePools } from '../../utils/scheduling';
import { showErrorNotification } from '../../utils/notifications';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COMBOS = 20;

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateInputValue(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function defaultCriteria(earliestSchedulable: Date): Criteria {
  const end = new Date(earliestSchedulable.getTime() + ONE_WEEK_MS);
  return {
    provider: 'any',
    room: 'any',
    device: 'any',
    dateStart: toDateInputValue(earliestSchedulable),
    dateEnd: toDateInputValue(end),
    timeOfDay: 'any',
  };
}

function filterPoolsByCriteria(
  pools: Partial<Record<ResourceType, WithId<Schedule>[]>>,
  criteria: Criteria
): Partial<Record<ResourceType, WithId<Schedule>[]>> {
  const filterOne = (
    resourceType: ResourceType,
    selected: string
  ): WithId<Schedule>[] | undefined => {
    const pool = pools[resourceType];
    if (!pool) {
      return undefined;
    }
    if (selected === 'any') {
      return pool;
    }
    return pool.filter((s) => getScheduleActorRef(s) === selected);
  };

  return {
    Practitioner: filterOne('Practitioner', criteria.provider),
    Location: filterOne('Location', criteria.room),
    Device: filterOne('Device', criteria.device),
  };
}

function matchesTimeOfDay(startIso: string, timeOfDay: Criteria['timeOfDay']): boolean {
  if (timeOfDay === 'any') {
    return true;
  }
  const hour = new Date(startIso).getHours();
  return timeOfDay === 'morning' ? hour < 12 : hour >= 12;
}

/**
 * Find & Book: multi-resource scheduling demo (spec §6). Front-office
 * admin picks a visit type, narrows criteria, and
 * searches across every eligible provider/room/device combo at once
 * (client-side combo orchestration, spec §4.2) — then books a provider +
 * room + device atomically for a patient in one action via `Appointment/$book`.
 * @returns A React component rendering the Find & Book page.
 */
export function SchedulingPage(): JSX.Element {
  const medplum = useMedplum();
  const [healthcareService, setHealthcareService] = useState<WithId<HealthcareService>>();
  const [bookingDrawerOpened, bookingDrawerHandlers] = useDisclosure(false);
  const [chosenSlot, setChosenSlot] = useState<ComboSlot>();
  const [criteriaPatient, setCriteriaPatient] = useState<WithId<Patient>>();
  const [bookingConfirmed, setBookingConfirmed] = useState<BookingConfirmedResult>();
  // When arriving via the Calendar screen's Reschedule action, this holds the
  // original appointment reference. Defer-cancel (spec §4.6, revised): the
  // original stays booked and is cancelled only after a *new* booking
  // succeeds (see onSuccess below), so an abandoned reschedule loses nothing.
  const [rescheduleRef, setRescheduleRef] = useState<string>();

  const [searchParams] = useSearchParams();
  const earliestSchedulable = useSchedulingStartsAt({ minimumNoticeMinutes: 30 });
  const [criteria, setCriteria] = useState<Criteria>(() => defaultCriteria(earliestSchedulable));

  // Optional pre-fill from the Calendar screen (all additive — absent on the
  // normal Find & Book entry point, so nothing changes there):
  //  - reschedule: `healthcareService` + `patient` + `reschedule` (original ref)
  //  - click-to-search from an empty calendar slot: `date` + `timeOfDay` +
  //    one of `provider`/`room`/`device`. These pre-fill *search criteria*,
  //    never appointment fields, so visit-type rules can't be bypassed.
  useEffect(() => {
    const prefillServiceRef = searchParams.get('healthcareService');
    if (prefillServiceRef) {
      medplum
        .readReference<WithId<HealthcareService>>({ reference: prefillServiceRef })
        .then(setHealthcareService)
        .catch(() => {
          // Best-effort — fall back to the normal blank-start flow if the
          // referenced resource no longer exists.
        });
    }
    const prefillPatientRef = searchParams.get('patient');
    if (prefillPatientRef) {
      medplum
        .readReference<WithId<Patient>>({ reference: prefillPatientRef })
        .then(setCriteriaPatient)
        .catch(() => {});
    }
    setRescheduleRef(searchParams.get('reschedule') ?? undefined);

    const date = searchParams.get('date');
    const timeOfDay = searchParams.get('timeOfDay');
    const provider = searchParams.get('provider');
    const room = searchParams.get('room');
    const device = searchParams.get('device');
    if (date || timeOfDay || provider || room || device) {
      setCriteria((prev) => ({
        ...prev,
        ...(date && { dateStart: date, dateEnd: date }),
        ...(timeOfDay === 'morning' || timeOfDay === 'afternoon' ? { timeOfDay } : {}),
        ...(provider && { provider }),
        ...(room && { room }),
        ...(device && { device }),
      }));
    }
    // Consult the URL once, on mount — the page's own controls own state after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medplum]);

  const [allSchedules, allSchedulesLoading, allSchedulesOutcome] = useSearchResources<'Schedule'>('Schedule', {
    _count: 100,
  });
  useNotifyOnError(allSchedulesOutcome);

  const pools = useMemo(
    () => (healthcareService ? resolveResourcePools(allSchedules ?? [], healthcareService) : {}),
    [allSchedules, healthcareService]
  );

  const filteredPools = useMemo(() => filterPoolsByCriteria(pools, criteria), [pools, criteria]);

  const combos = useMemo(() => cartesianCombos(filteredPools, MAX_COMBOS), [filteredPools]);

  const range = useMemo(() => {
    const start = new Date(`${criteria.dateStart}T00:00:00`);
    const end = new Date(`${criteria.dateEnd}T23:59:59`);
    const effectiveStart = start < earliestSchedulable ? earliestSchedulable : start;
    const effectiveEnd = effectiveStart < end ? end : new Date(effectiveStart.getTime() + ONE_WEEK_MS);
    return { start: effectiveStart, end: effectiveEnd };
  }, [criteria.dateStart, criteria.dateEnd, earliestSchedulable]);

  const { slots, loading: slotsLoading } = useMultiResourceFind({ combos, healthcareService, range });

  const timeFilteredSlots = useMemo(
    () => (slots ?? []).filter((slot) => matchesTimeOfDay(slot.appointment.start ?? '', criteria.timeOfDay)),
    [slots, criteria.timeOfDay]
  );

  const actorLabels = useActorLabels(pools);
  const actorLabel = (ref: Reference): string => {
    const refStr = getReferenceString(ref);
    return (refStr && actorLabels.get(refStr)) || refStr || 'Unknown';
  };

  // The month calendar's displayed month always follows the criteria's own
  // date range (typing a far-future start date jumps the calendar there
  // too) — there's a single source of truth for what's actually searched,
  // rather than a separate calendar-only query.
  const calendarMonth = useMemo(() => {
    const parsed = parseDateInputValue(criteria.dateStart);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [criteria.dateStart]);
  const selectedDayKey =
    criteria.dateStart === criteria.dateEnd ? localDayKey(parseDateInputValue(criteria.dateStart)) : undefined;
  const daysWithAvailability = useMemo(() => {
    const days = new Set<string>();
    for (const slot of timeFilteredSlots) {
      if (slot.appointment.start) {
        days.add(localDayKey(slot.appointment.start));
      }
    }
    return days;
  }, [timeFilteredSlots]);

  const handleSelectDay = (day: Date): void => {
    // Clicking the already-selected day toggles back to the whole month,
    // rather than needing a separate "view whole month" control.
    if (selectedDayKey === localDayKey(day)) {
      setCriteria({
        ...criteria,
        dateStart: toDateInputValue(firstOfMonth(calendarMonth)),
        dateEnd: toDateInputValue(lastOfMonth(calendarMonth)),
      });
      return;
    }
    const value = toDateInputValue(day);
    setCriteria({ ...criteria, dateStart: value, dateEnd: value });
  };
  const handleNavigateMonth = (direction: -1 | 1): void => {
    const newMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + direction, 1);
    setCriteria({ ...criteria, dateStart: toDateInputValue(firstOfMonth(newMonth)), dateEnd: toDateInputValue(lastOfMonth(newMonth)) });
  };

  const loading = allSchedulesLoading || slotsLoading;

  // Fixed to the single demo clinic (spec §6.2) — the Location/Room criteria
  // filter above is what actually narrows the resource pool.
  const clinicName = 'Uro Associates – Main Clinic';

  return (
    <>
      <Stack gap="md" p="md">
        {rescheduleRef && (
          <Alert color="blue" title="Rescheduling">
            Search for a new time and book it. The original appointment stays booked until you confirm the new one — if
            you leave without rebooking, nothing changes.
          </Alert>
        )}
        <Box w={320}>
          <ResourceInput<WithId<HealthcareService>>
            key={healthcareService?.id}
            name="healthcareService"
            resourceType="HealthcareService"
            defaultValue={healthcareService}
            onChange={setHealthcareService}
            placeholder="Visit type"
          />
        </Box>

        {!healthcareService && (
          <Paper withBorder p="xl" radius="md">
            <Stack align="center" gap="xs" py="xl">
              <IconCalendarSearch size={40} stroke={1.5} color="var(--mantine-color-dimmed)" />
              <Text size="lg" fw={600}>
                Select a visit type to get started
              </Text>
              <Text size="sm" c="dimmed">
                Choose a visit type above to search for available providers, rooms, and equipment.
              </Text>
            </Stack>
          </Paper>
        )}

        {healthcareService && (
          <Grid gutter="md">
            <Grid.Col span={3}>
              <CriteriaPanel
                pools={pools}
                clinicName={clinicName}
                criteria={criteria}
                onChange={setCriteria}
                patient={criteriaPatient}
                onPatientChange={setCriteriaPatient}
              />
            </Grid.Col>
            <Grid.Col span="auto" pos="relative">
              <LoadingOverlay visible={loading} />
              <Title order={4} mb="sm">
                {healthcareService.name}
              </Title>
              {combos.length === 0 && (
                <Alert color="yellow">No eligible resource combination for the selected criteria.</Alert>
              )}
              {combos.length > 0 && (
                <Group align="flex-start" gap="lg" wrap="wrap">
                  <Box style={{ flex: '0 0 380px' }}>
                    <MonthCalendar
                      month={calendarMonth}
                      daysWithAvailability={daysWithAvailability}
                      selectedDayKey={selectedDayKey}
                      onSelectDay={handleSelectDay}
                      onNavigateMonth={handleNavigateMonth}
                    />
                  </Box>
                  <Box style={{ flex: '1 1 420px', minWidth: 0 }}>
                    <SlotList
                      slots={timeFilteredSlots}
                      actorLabel={actorLabel}
                      onSelect={(slot) => {
                        setChosenSlot(slot);
                        bookingDrawerHandlers.open();
                      }}
                    />
                  </Box>
                </Group>
              )}
            </Grid.Col>
          </Grid>
        )}
      </Stack>

      <Drawer
        title="Create Appointment"
        opened={bookingDrawerOpened}
        onClose={bookingDrawerHandlers.close}
        position="right"
        size="lg"
      >
        {chosenSlot && healthcareService && (
          <BookAppointmentForm
            appointment={chosenSlot.appointment}
            healthcareService={healthcareService}
            comboActors={chosenSlot.combo.schedules.map((s) => ({
              ref: s.actor[0],
              label: actorLabel(s.actor[0]),
            }))}
            defaultPatient={criteriaPatient}
            onSuccess={(result) => {
              bookingDrawerHandlers.close();
              // Defer-cancel completion: the new booking succeeded, so now
              // release the original appointment being rescheduled (if any).
              // Doing it here — not before the rebook — is what makes an
              // abandoned reschedule non-destructive (spec §4.6, revised).
              if (rescheduleRef) {
                const [, originalId] = rescheduleRef.split('/');
                medplum
                  .post(medplum.fhirUrl('Appointment', originalId, '$cancel'))
                  .catch((err) => {
                    // New appointment already exists; surface the failure so
                    // the admin can cancel the original manually rather than
                    // silently leaving two active appointments.
                    showErrorNotification(err);
                  })
                  .finally(() => {
                    medplum.invalidateSearches('Appointment');
                    medplum.invalidateSearches('Slot');
                  });
                setRescheduleRef(undefined);
              }
              medplum.invalidateSearches('Appointment');
              medplum.invalidateSearches('Slot');
              setBookingConfirmed({
                appointment: result.appointment,
                patient: result.patient,
                encounter: result.encounter,
                comboSummary: chosenSlot.combo.schedules.map((s) => actorLabel(s.actor[0])).join(' · '),
              });
            }}
          />
        )}
      </Drawer>

      <BookingConfirmedModal result={bookingConfirmed} onClose={() => setBookingConfirmed(undefined)} />
    </>
  );
}

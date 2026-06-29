// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EventClickInfo, EventInput, EventSourceInput } from '@fullcalendar/react';
import FullCalendar from '@fullcalendar/react';
import '@fullcalendar/react/skeleton.css';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/themes/classic/palette.css';
import '@fullcalendar/react/themes/classic/theme.css';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Drawer,
  getThemeColor,
  Grid,
  LoadingOverlay,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { EMPTY, formatDateTime, getReferenceString, isDefined, parseReference } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  HealthcareService,
  Reference,
  ResourceType,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { ReferenceDisplay, ResourceInput, useMedplum } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import cx from 'clsx';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AppointmentDetails } from '../../components/schedule/AppointmentDetails';
import { BookAppointmentForm } from '../../components/schedule/BookAppointmentForm';
import { useNotifyOnError } from '../../hooks/useNotifyOnError';
import { useSchedulingStartsAt } from '../../hooks/useSchedulingStartsAt';
import type { Range } from '../../types/scheduling';
import { assertNever } from '../../utils/assert';
import { showErrorNotification } from '../../utils/notifications';
import { isSchedulableFor } from '../../utils/scheduling';
import classes from './SchedulingPage.module.css';

type ExtendedEvent = { type: 'appointment'; appointment: WithId<Appointment> } | { type: 'slot'; slot: Slot };

type ColorTheme = {
  appointment: string;
  slot: string;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const COLOR_THEMES: ColorTheme[] = [
  { appointment: 'indigo.7', slot: 'indigo.5' },
  { appointment: 'teal.7', slot: 'teal.5' },
  { appointment: 'orange.7', slot: 'orange.5' },
  { appointment: 'pink.7', slot: 'pink.5' },
  { appointment: 'violet.7', slot: 'violet.5' },
  { appointment: 'blue.7', slot: 'blue.5' },
  { appointment: 'cyan.7', slot: 'cyan.5' },
  { appointment: 'lime.7', slot: 'lime.5' },
  { appointment: 'red.7', slot: 'red.5' },
  { appointment: 'yellow.7', slot: 'yellow.5' },
  { appointment: 'grape.7', slot: 'grape.5' },
];

const themeMap = new Map<string, ColorTheme>();

function colorThemeForId(id: string): ColorTheme {
  let theme = themeMap.get(id);
  if (theme) {
    return theme;
  }
  theme = COLOR_THEMES[themeMap.size % COLOR_THEMES.length];
  themeMap.set(id, theme);
  return theme;
}

function appointmentToEvent(appointment: WithId<Appointment>): EventInput {
  // Find the patient among the participants to use as title
  const patientParticipant = appointment.participant.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const name = patientParticipant ? patientParticipant.actor?.display : 'No Patient';
  const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status) ? ` (${appointment.status})` : '';

  return {
    title: `${name} ${status}`,
    start: appointment.start,
    end: appointment.end,
    className: cx(classes.appointment, classes[appointment.status]),
    interactive: true,
    extendedProps: { type: 'appointment', appointment } satisfies ExtendedEvent,
  };
}

function slotToEvent(slot: Slot): EventInput {
  return {
    title: slot.status === 'free' ? 'Available' : 'Blocked',
    start: slot.start,
    end: slot.end,
    className: cx(classes.slot, classes[slot.status]),
    interactive: true,
    extendedProps: { type: 'slot', slot } satisfies ExtendedEvent,
  };
}

type ScheduleSlotsLoaderProps = {
  scheduleRef: string;
  range: Range;
  onResult: (scheduleRef: string, slots: WithId<Slot>[], loading: boolean) => void;
};

function ScheduleSlotsLoader({ scheduleRef, range, onResult }: ScheduleSlotsLoaderProps): null {
  const [slots, loading, outcome] = useSearchResources('Slot', [
    ['_count', '1000'],
    ['schedule', scheduleRef],
    ['start', `ge${range.start.toISOString()}`],
    ['start', `le${range.end.toISOString()}`],
    ['status:not', 'entered-in-error'],
  ]);
  useNotifyOnError(outcome);

  useEffect(() => {
    onResult(scheduleRef, slots ?? [], loading);
  }, [scheduleRef, slots, loading, onResult]);

  return null;
}

type ActorAppointmentsLoaderProps = {
  actorRef: string;
  range: Range;
  onResult: (actorRef: string, appointments: WithId<Appointment>[], loading: boolean) => void;
};

function ActorAppointmentsLoader({ actorRef, range, onResult }: ActorAppointmentsLoaderProps): null {
  const [appointments, loading, outcome] = useSearchResources('Appointment', [
    ['_count', '1000'],
    ['actor', actorRef],
    ['date', `ge${range.start.toISOString()}`],
    ['date', `le${range.end.toISOString()}`],
    ['status:not', 'cancelled'],
  ]);
  useNotifyOnError(outcome);

  useEffect(() => {
    onResult(actorRef, appointments ?? [], loading);
  }, [actorRef, appointments, loading, onResult]);

  return null;
}

type ActorChooserProps = {
  schedules: Schedule[];
  selected: string[];
  onChange: (selected: string[]) => void;
  healthcareService?: WithId<HealthcareService>;
};

export function ActorChooser(props: ActorChooserProps): JSX.Element {
  const actorsByType: Partial<Record<ResourceType, { reference: Reference; schedulable: boolean }[]>> = useMemo(() => {
    const result: Partial<Record<ResourceType, { reference: Reference; schedulable: boolean }[]>> = {};
    props.schedules.forEach((schedule) => {
      const schedulable = !props.healthcareService || isSchedulableFor(schedule, props.healthcareService);

      schedule.actor.forEach((reference) => {
        const actorType = parseReference(reference)[0];
        result[actorType] ||= [];
        result[actorType].push({ reference, schedulable });
      });
    });
    return result;
  }, [props.schedules, props.healthcareService]);

  return (
    <Stack gap="lg">
      {Object.entries(actorsByType).map(([resourceType, values]) => (
        <Stack gap="sm" key={resourceType}>
          <Title order={4}>{resourceType}</Title>
          {values.map((value) => {
            const ref = getReferenceString(value.reference);
            if (!ref) {
              return null;
            }
            const color = colorThemeForId(ref);

            return (
              <Checkbox
                key={ref}
                checked={props.selected.includes(ref)}
                classNames={{
                  root: value.schedulable ? classes.schedulable : classes.unschedulable,
                  labelWrapper: classes.wideLabel,
                }}
                label={<ReferenceDisplay value={value.reference} link={false} />}
                color={color.appointment}
                onChange={(event) => {
                  if (event.target.checked) {
                    props.onChange([...props.selected, ref]);
                  } else {
                    props.onChange(props.selected.filter((s) => s !== ref));
                  }
                }}
              />
            );
          })}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Scheduling page that displays schedules for many actors.
 * @returns A React component that displays the schedule page.
 */
export function SchedulingPage(): JSX.Element | null {
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const [range, setRange] = useState<Range | undefined>(undefined);
  const [healthcareService, setHealthcareService] = useState<WithId<HealthcareService>>();
  const [bookingDrawerOpened, bookingDrawerHandlers] = useDisclosure(false);
  const [appointmentDetailsOpened, appointmentDetailsHandlers] = useDisclosure(false);
  const [appointmentDetails, setAppointmentDetails] = useState<WithId<Appointment> | undefined>(undefined);

  // Q: should this use `{ _include: 'Schedule:actor' }`?
  const [allSchedules, allSchedulesLoading, allSchedulesOutcome] = useSearchResources<'Schedule'>('Schedule', {
    _count: 100,
  });
  useNotifyOnError(allSchedulesOutcome);

  const [searchParams, setSearchParams] = useSearchParams();

  const actors = useMemo(() => {
    return searchParams
      .getAll('actor')
      .filter((actorStr) =>
        allSchedules?.some((schedule) => schedule.actor.some((actorRef) => getReferenceString(actorRef) === actorStr))
      );
  }, [allSchedules, searchParams]);

  const selectedSchedules = useMemo(
    () =>
      allSchedules?.filter((schedule) =>
        schedule.actor.some((actor) => {
          const ref = getReferenceString(actor);
          return ref && actors.includes(ref);
        })
      ),
    [allSchedules, actors]
  );

  // Slots are fetched per-schedule via ScheduleSlotsLoader components rendered below.
  const [slotsMap, setSlotsMap] = useState<Map<string, WithId<Slot>[]>>(new Map());
  const [loadingScheduleRefs, setLoadingScheduleRefs] = useState<Set<string>>(new Set());

  const handleSlotResult = useCallback((scheduleRef: string, slots: WithId<Slot>[], loading: boolean) => {
    setSlotsMap((prev) => new Map(prev).set(scheduleRef, slots));
    setLoadingScheduleRefs((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(scheduleRef);
      } else {
        next.delete(scheduleRef);
      }
      return next;
    });
  }, []);

  // Appointments are fetched per-actor via ActorAppointmentsLoader components rendered below.
  const [appointmentsMap, setAppointmentsMap] = useState<Map<string, WithId<Appointment>[]>>(new Map());
  const [loadingActorRefs, setLoadingActorRefs] = useState<Set<string>>(new Set());

  const handleAppointmentResult = useCallback(
    (actorRef: string, appointments: WithId<Appointment>[], loading: boolean) => {
      setAppointmentsMap((prev) => new Map(prev).set(actorRef, appointments));
      setLoadingActorRefs((prev) => {
        const next = new Set(prev);
        if (loading) {
          next.add(actorRef);
        } else {
          next.delete(actorRef);
        }
        return next;
      });
    },
    []
  );

  // Q: SchedulePage.tsx merged overlapping slots on a single calendar into a
  // single display slot; is that desirable in the multi-calendar view?

  const loading = allSchedulesLoading || loadingScheduleRefs.size > 0 || loadingActorRefs.size > 0;

  const eventSources = useMemo(() => {
    return actors.flatMap((actor) => {
      const colorTheme = colorThemeForId(actor);
      const apts = appointmentsMap.get(actor) ?? [];

      const appointmentBySlot = apts.reduce<Record<string, Appointment>>((acc, appointment) => {
        (appointment.slot ?? EMPTY).forEach((slotRef) => {
          const key = getReferenceString(slotRef);
          if (key) {
            acc[key] = appointment;
          }
        });
        return acc;
      }, {});

      const appointmentSource = {
        events: apts.filter((apt) => apt.status !== 'cancelled').map((apt) => appointmentToEvent(apt)),
        color: getThemeColor(colorTheme.appointment, theme),
      } satisfies EventSourceInput;

      const scheduleRefs = (allSchedules ?? [])
        .filter((schedule) => schedule.actor.some((x) => getReferenceString(x) === actor))
        .map((schedule) => getReferenceString(schedule));

      const mySlots = scheduleRefs
        .flatMap((ref) => slotsMap.get(ref) ?? [])
        .filter((slot) => {
          // don't show slots that are exact matches for the appointment that references them
          const key = getReferenceString(slot);
          if (key && appointmentBySlot[key]) {
            const appointment = appointmentBySlot[key];
            if (slot.start === appointment.start && slot.end === appointment.end) {
              return false;
            }
          }
          return true;
        });

      const slotSource = {
        events: mySlots.map(slotToEvent),
        color: getThemeColor(colorTheme.slot, theme),
      };

      return [appointmentSource, slotSource];
    });
  }, [appointmentsMap, slotsMap, allSchedules, actors, theme]);

  const allSchedulable =
    healthcareService && selectedSchedules?.every((schedule) => isSchedulableFor(schedule, healthcareService));

  const earliestSchedulable = useSchedulingStartsAt({ minimumNoticeMinutes: 30 });

  const medplum = useMedplum();
  const [availableAppointments, setAvailableAppointments] = useState<Appointment[] | undefined>();
  useEffect(() => {
    let running = true;

    if (!range || !allSchedulable || !healthcareService || !selectedSchedules?.length) {
      setAvailableAppointments(undefined);
      return () => {};
    }

    const searchStart = range.start < earliestSchedulable ? earliestSchedulable : range.start;
    const searchEnd = searchStart < range.end ? range.end : new Date(searchStart.getTime() + ONE_WEEK_MS);

    const url = medplum.fhirUrl('Appointment', '$find');
    url.searchParams.append('start', searchStart.toISOString());
    url.searchParams.append('end', searchEnd.toISOString());
    url.searchParams.append('service-type-reference', getReferenceString(healthcareService));

    selectedSchedules.forEach((schedule) => {
      url.searchParams.append('schedule', getReferenceString(schedule));
    });

    medplum
      .get<Bundle<Appointment>>(url)
      .then((bundle) => {
        if (running) {
          setAvailableAppointments(bundle?.entry?.map((x) => x.resource).filter(isDefined) ?? []);
        }
      })
      .catch((err) => {
        if (running) {
          showErrorNotification(err);
        }
      });

    return () => {
      running = false;
    };
  }, [medplum, range, selectedSchedules, healthcareService, allSchedulable, earliestSchedulable]);

  const [chosenAppointment, setChosenAppointment] = useState<Appointment>();

  const handleAppointmentUpdate = useCallback(
    (updated: WithId<Appointment>) => {
      console.log('appointment update', updated);
      setAppointmentsMap((prev) => {
        const next = new Map(prev);
        updated.participant?.forEach((p) => {
          const actorRef = p.actor ? getReferenceString(p.actor) : undefined;
          console.log(actorRef, actorRef && actors.includes(actorRef));
          if (actorRef && actors.includes(actorRef)) {
            const appointments = next.get(actorRef) ?? [];
            const existing = appointments.filter((apt) => apt.id !== updated.id);
            next.set(actorRef, [...existing, updated]);
          }
        });
        return next;
      });

      setAppointmentDetails((existing) => (existing?.id === updated.id ? updated : existing));
      if (updated.status === 'cancelled') {
        const cancelledSlotRefs = new Set((updated.slot ?? []).map((ref) => getReferenceString(ref)).filter(isDefined));
        if (cancelledSlotRefs.size > 0) {
          setSlotsMap((prev) => {
            const next = new Map(prev);
            next.forEach((slots, scheduleRef) => {
              next.set(
                scheduleRef,
                slots.filter((slot) => !cancelledSlotRefs.has(getReferenceString(slot)))
              );
            });
            return next;
          });
        }
        appointmentDetailsHandlers.close();
      }
    },
    [appointmentDetailsHandlers, actors]
  );

  const handleSlotUpdates = useCallback((updated: WithId<Slot>[]) => {
    setSlotsMap((prev) => {
      const next = new Map(prev);
      updated.forEach((slot) => {
        const scheduleRef = getReferenceString(slot.schedule);
        if (scheduleRef) {
          const slots = next.get(scheduleRef) ?? [];
          const existing = slots.filter((x) => x.id !== slot.id);
          next.set(scheduleRef, [...existing, slot]);
        }
      });
      return next;
    });
  }, []);

  const handleBookSuccess = useCallback(
    (results: { appointment: WithId<Appointment>; slots: WithId<Slot>[] }) => {
      bookingDrawerHandlers.close();
      const { appointment } = results;

      handleAppointmentUpdate(appointment);
      handleSlotUpdates(results.slots);
    },
    [bookingDrawerHandlers, handleAppointmentUpdate, handleSlotUpdates]
  );

  const handleEventClick = (info: EventClickInfo): void => {
    const ext = info.event.extendedProps as ExtendedEvent;
    if (ext.type === 'appointment') {
      setAppointmentDetails(ext.appointment);
      appointmentDetailsHandlers.open();
    } else if (ext.type === 'slot') {
      // Slot clicks intentionally ignored for now; no detail view yet
    } else {
      assertNever(ext);
    }
  };

  return (
    <>
      {range &&
        selectedSchedules?.map((schedule) => {
          const ref = getReferenceString(schedule);
          return <ScheduleSlotsLoader key={ref} scheduleRef={ref} range={range} onResult={handleSlotResult} />;
        })}
      {range &&
        actors.map((actorRef) => (
          <ActorAppointmentsLoader
            key={actorRef}
            actorRef={actorRef}
            range={range}
            onResult={handleAppointmentResult}
          />
        ))}
      <Stack gap="md" p="md">
        <Box w={320}>
          <ResourceInput<WithId<HealthcareService>>
            name="healthcareService"
            resourceType="HealthcareService"
            onChange={setHealthcareService}
            placeholder="Service type"
          />
        </Box>
        <Grid gutter="md">
          <Grid.Col span={3}>
            <ActorChooser
              schedules={allSchedules ?? []}
              selected={actors}
              onChange={(actor: string[]) => setSearchParams({ actor })}
              healthcareService={healthcareService}
            />
          </Grid.Col>
          <Grid.Col
            span="auto"
            pos="relative"
            style={{
              // Set `minWidth: 0` to prevent fullcalendar from going into a
              // render loop when the available appointments pane jumps in/out;
              // @see https://github.com/fullcalendar/fullcalendar/issues/8076
              minWidth: '0',
            }}
          >
            <LoadingOverlay visible={loading} />
            <FullCalendar
              plugins={[themePlugin, timeGridPlugin]}
              initialView="timeGridWeek"
              datesSet={setRange}
              eventSources={eventSources}
              slotDuration="00:15:00"
              height="95vh"
              headerToolbar={{
                left: 'title',
                right: 'prev,today,next',
              }}
              allDaySlot={false}
              colorScheme={colorScheme}
              eventInnerClass={classes.eventInner}
              eventTitleClass={classes.eventTitle}
              eventClick={handleEventClick}
            />
          </Grid.Col>
          {healthcareService && (
            <Grid.Col span={3}>
              <Title order={2} mb="md">
                {healthcareService.name}
              </Title>
              {!allSchedulable && <Alert>Selected schedules are not enabled for this service type</Alert>}
              {allSchedulable && availableAppointments?.length === 0 && (
                <Text size="sm" c="dimmed">
                  No available appointments found in this calendar range.
                </Text>
              )}
              {allSchedulable && (
                <Stack gap="sm">
                  {availableAppointments?.map((appointment) => (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setChosenAppointment(appointment);
                        bookingDrawerHandlers.open();
                      }}
                      key={appointment.start}
                    >
                      {formatDateTime(appointment.start)}
                    </Button>
                  ))}
                </Stack>
              )}
            </Grid.Col>
          )}
        </Grid>
      </Stack>

      {/* Modals */}
      <Drawer
        title="Create Appointment"
        opened={bookingDrawerOpened}
        onClose={bookingDrawerHandlers.close}
        position="right"
      >
        {chosenAppointment && healthcareService && (
          <BookAppointmentForm
            appointment={chosenAppointment}
            onSuccess={handleBookSuccess}
            healthcareService={healthcareService}
          />
        )}
      </Drawer>
      <Drawer
        opened={appointmentDetailsOpened}
        onClose={appointmentDetailsHandlers.close}
        title={
          <Text size="lg" fw={700}>
            Appointment Details
          </Text>
        }
        position="right"
      >
        {appointmentDetails && (
          <AppointmentDetails
            appointment={appointmentDetails}
            onAppointmentUpdate={handleAppointmentUpdate}
            onSlotUpdate={(slot) => handleSlotUpdates([slot])}
          />
        )}
      </Drawer>
    </>
  );
}

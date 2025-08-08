// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Drawer, Group, SegmentedControl, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, getReferenceString, WithId } from '@medplum/core';
import { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { JSX, useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, dayjsLocalizer, Event, SlotInfo, ToolbarProps, View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useNavigate } from 'react-router';
import { BlockAvailability } from '../components/schedule/BlockAvailability';
import { CreateUpdateSlot } from '../components/schedule/CreateUpdateSlot';
import { SetAvailability } from '../components/schedule/SetAvailability';
import { SlotDetails } from '../components/schedule/SlotDetails';
import { CreateVisit } from '../components/schedule/CreateVisit';
import { showErrorNotification } from '../utils/notifications';

type AppointmentEvent = Event & { type: 'appointment'; appointment: Appointment; start: Date; end: Date };
type SlotEvent = Event & { type: 'slot'; status: string; start: Date; end: Date };
type ScheduleEvent = AppointmentEvent | SlotEvent;

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to set availability, block availability, create/update slots, and create
 * appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const calendarRef = useRef<Calendar<ScheduleEvent>>(null);
  const [schedule, setSchedule] = useState<WithId<Schedule> | undefined>();
  const [view, setView] = useState<View>('week');
  const [date, setDate] = useState<Date>(new Date());
  const [range, setRange] = useState<{ start: Date; end: Date } | undefined>(undefined);
  const [blockAvailabilityOpened, blockAvailabilityHandlers] = useDisclosure(false);
  const [setAvailabilityOpened, setAvailabilityHandlers] = useDisclosure(false);
  const [slotDetailsOpened, slotDetailsHandlers] = useDisclosure(false);
  const [createUpdateSlotOpened, createUpdateSlotHandlers] = useDisclosure(false);
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [slotEvents, setSlotEvents] = useState<ScheduleEvent[]>();
  const [appointmentEvents, setAppointmentEvents] = useState<ScheduleEvent[]>();
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent>();

  const [appointmentSlot, setAppointmentSlot] = useState<SlotInfo>();

  useEffect(() => {
    if (medplum.isLoading() || !profile) {
      return;
    }

    // Search for a Schedule associated with the logged user,
    // create one if it doesn't exist
    medplum
      .searchOne('Schedule', { actor: getReferenceString(profile) })
      .then((foundSchedule) => {
        if (foundSchedule) {
          setSchedule(foundSchedule);
        } else {
          medplum
            .createResource({
              resourceType: 'Schedule',
              actor: [createReference(profile)],
              active: true,
            })
            .then(setSchedule)
            .catch(console.error);
        }
      })
      .catch(console.error);
  }, [medplum, profile]);

  const handleRangeChange = useCallback(
    (newRange: Date[] | { start: Date; end: Date }) => {
      let newStart: Date;
      let newEnd: Date;
      if (Array.isArray(newRange)) {
        // Week view passes the range as an array of dates
        newStart = newRange[0];
        newEnd = new Date(newRange[newRange.length - 1].getTime() + 24 * 60 * 60 * 1000);
      } else {
        // Other views pass the range as an object
        newStart = newRange.start;
        newEnd = newRange.end;
      }

      // Only update state if the range has changed
      if (!range || newStart.getTime() !== range.start.getTime() || newEnd.getTime() !== range.end.getTime()) {
        setRange({ start: newStart, end: newEnd });
      }
    },
    [range, setRange]
  );

  const refreshEvents = useCallback(
    (cache?: RequestCache) => {
      const calendar = calendarRef.current;
      if (!calendar || !schedule || !range) {
        return;
      }

      const start = range.start.toISOString();
      const end = range.end.toISOString();

      async function searchSlots(): Promise<void> {
        const slots = await medplum.searchResources(
          'Slot',
          [
            ['_count', '1000'],
            ['schedule', getReferenceString(schedule as WithId<Schedule>)],
            ['start', `ge${start}`],
            ['start', `le${end}`],
          ],
          { cache }
        );
        setSlotEvents(slotsToEvents(slots));
      }

      async function searchAppointments(): Promise<void> {
        const appointments = await medplum.searchResources(
          'Appointment',
          [
            ['_count', '1000'],
            ['actor', getReferenceString(profile as WithId<Practitioner>)],
            ['date', `ge${start}`],
            ['date', `le${end}`],
          ],
          { cache }
        );
        setAppointmentEvents(appointmentsToEvents(appointments));
      }

      Promise.allSettled([searchSlots(), searchAppointments()]).catch(console.error);
    },
    [medplum, profile, schedule, range]
  );

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  /**
   * When a date/time range is selected, set the event object and open the create slot modal
   */
  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      createAppointmentHandlers.open();
      setAppointmentSlot(slot);
    },
    [createAppointmentHandlers]
  );

  /**
   * When an existing event (slot/appointment) is selected, set the event object and open the
   * appropriate modal.
   * - If the event is a free slot, open the create appointment modal.
   * - If the event is a busy-unavailable slot, open the slot details modal.
   * - If the event is an appointment, navigate to the appointment page.
   */
  const handleSelectEvent = useCallback(
    async (event: ScheduleEvent) => {
      const { resourceType, status } = event.resource;

      function handleSlot(): void {
        setSelectedEvent(event);
        if (status === 'free') {
          createAppointmentHandlers.open();
        } else {
          slotDetailsHandlers.open();
        }
      }

      async function handleAppointment(): Promise<void> {
        const encounters = await medplum.searchResources('Encounter', [
          ['appointment', getReferenceString(event.resource)],
          ['_count', '1'],
        ]);
        const patient = encounters?.[0]?.subject;
        if (patient?.reference) {
          navigate(`/${patient.reference}/Encounter/${encounters?.[0]?.id}`)?.catch(console.error);
        }
      }

      if (resourceType === 'Slot') {
        handleSlot();
        return;
      }

      if (resourceType === 'Appointment') {
        handleAppointment().catch((err) => showErrorNotification(err));
      }
    },
    [slotDetailsHandlers, createAppointmentHandlers, navigate, medplum]
  );

  if (!schedule) {
    return null;
  }

  const height = window.innerHeight - 60;

  const CustomToolbar = (props: ToolbarProps<ScheduleEvent>): JSX.Element => {
    const [firstRender, setFirstRender] = useState(true);
    useEffect(() => {
      // The calendar does not provide any way to receive the range of dates that
      // are visible except when they change. This is the cleanest way I could find
      // to extend it to provide the _initial_ range (`onView` calls `onRangeChange`).
      // https://github.com/jquense/react-big-calendar/issues/1752#issuecomment-761051235
      if (firstRender) {
        props.onView(props.view);
        setFirstRender(false);
      }
    }, [props, firstRender, setFirstRender]);
    return (
      <Group justify="space-between" pb="sm">
        <Group>
          <Title order={4} mr="md">
            {props.view !== 'day' && dayjs(props.date).format('MMMM YYYY')}
            {props.view === 'day' && dayjs(props.date).format('MMMM D YYYY')}
          </Title>
          <Button.Group>
            <Button variant="default" size="xs" onClick={() => props.onNavigate('PREV')}>
              <IconChevronLeft size={12} />
            </Button>
            <Button variant="default" size="xs" onClick={() => props.onNavigate('TODAY')}>
              Today
            </Button>
            <Button variant="default" size="xs" onClick={() => props.onNavigate('NEXT')}>
              <IconChevronRight size={12} />
            </Button>
          </Button.Group>
        </Group>
        <SegmentedControl
          size="xs"
          value={props.view}
          onChange={(newView) => setView(newView as View)}
          data={[
            { label: 'Month', value: 'month' },
            { label: 'Week', value: 'week' },
            { label: 'Day', value: 'day' },
          ]}
        />
        <Button.Group>
          <Button variant="default" size="xs" onClick={() => setAvailabilityHandlers.open()}>
            Set Availability
          </Button>
          <Button variant="default" size="xs" onClick={() => blockAvailabilityHandlers.open()}>
            Block Availability
          </Button>
        </Button.Group>
      </Group>
    );
  };

  function eventPropGetter(
    event: ScheduleEvent,
    _start: Date,
    _end: Date,
    _isSelected: boolean
  ): { className?: string | undefined; style?: React.CSSProperties } {
    const result = {
      style: {
        backgroundColor: '#228be6',
        border: '1px solid rgba(255, 255, 255, 0)',
        borderRadius: '4px',
        color: 'white',
        display: 'block',
        opacity: 1.0,
      },
    };

    if (event.type === 'slot') {
      result.style.backgroundColor = event.status === 'free' ? '#d3f9d8' : '#ced4da';
      result.style.color = 'black';
      result.style.opacity = 0.6;
    }

    return result;
  }

  dayjs.extend(utc);
  dayjs.extend(timezone);
  dayjs.tz.setDefault(dayjs.tz.guess());

  return (
    <Box pos="relative" bg="white" p="md" style={{ height }}>
      <Calendar
        ref={calendarRef}
        components={{ toolbar: CustomToolbar }}
        view={view}
        date={date}
        localizer={dayjsLocalizer(dayjs)}
        events={appointmentEvents}
        backgroundEvents={slotEvents} // Background events don't show in the month view
        onNavigate={(newDate: Date, newView: View) => {
          setDate(newDate);
          setView(newView);
        }}
        onRangeChange={handleRangeChange}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        scrollToTime={date} // Default scroll to current time
        style={{ height: height - 150 }}
        selectable
        eventPropGetter={eventPropGetter}
      />

      {/* Modals */}
      <SetAvailability schedule={schedule} opened={setAvailabilityOpened} handlers={setAvailabilityHandlers} />
      <BlockAvailability schedule={schedule} opened={blockAvailabilityOpened} handlers={blockAvailabilityHandlers} />
      <CreateUpdateSlot
        schedule={schedule}
        event={selectedEvent}
        opened={createUpdateSlotOpened}
        handlers={createUpdateSlotHandlers}
        onSlotsUpdated={() => refreshEvents('no-cache')}
      />
      <SlotDetails
        schedule={schedule}
        event={selectedEvent}
        opened={slotDetailsOpened}
        handlers={slotDetailsHandlers}
        onSlotsUpdated={() => refreshEvents('no-cache')}
      />

      <Drawer
        opened={createAppointmentOpened}
        onClose={createAppointmentHandlers.close}
        title="New Calendar Event"
        position="right"
        h="100%"
      >
        <CreateVisit appointmentSlot={appointmentSlot} />
      </Drawer>
    </Box>
  );
}

// This function collapses contiguous or overlapping slots of the same status into single events
function slotsToEvents(slots: Slot[]): SlotEvent[] {
  if (!slots || slots.length === 0) {
    return [];
  }

  // First, filter the slots as before
  const filteredSlots = slots.filter((slot) => slot.status === 'free' || slot.status === 'busy-unavailable');

  // Group slots by status
  const slotsByStatus: Record<string, SlotEvent[]> = {};
  filteredSlots.forEach((slot) => {
    if (!slotsByStatus[slot.status]) {
      slotsByStatus[slot.status] = [];
    }
    slotsByStatus[slot.status].push({
      type: 'slot',
      status: slot.status,
      start: new Date(slot.start),
      end: new Date(slot.end),
    });
  });

  const collapsedEvents: SlotEvent[] = [];

  // Process each status group separately
  Object.entries(slotsByStatus).forEach(([status, statusSlots]) => {
    // Sort slots by start time
    statusSlots.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Merge contiguous/overlapping slots
    let currentGroup: SlotEvent | undefined = undefined;

    for (const slot of statusSlots) {
      if (!currentGroup) {
        // Start a new group
        currentGroup = {
          type: 'slot',
          status,
          start: slot.start,
          end: slot.end,
        };
      } else if (slot.start <= new Date(currentGroup.end.getTime() + 1000)) {
        // Slot is contiguous or overlapping with current group
        // The +1000ms (1 second) tolerance handles potential tiny gaps

        // Extend end time if needed
        if (slot.end > currentGroup.end) {
          currentGroup.end = slot.end;
        }
      } else {
        // This slot doesn't connect to the current group
        // Finish current group and start a new one
        collapsedEvents.push({
          type: 'slot',
          status: currentGroup.status,
          title: status === 'free' ? 'Available' : 'Blocked',
          start: currentGroup.start,
          end: currentGroup.end,
        });

        currentGroup = {
          type: 'slot',
          status,
          start: slot.start,
          end: slot.end,
        };
      }
    }

    // Don't forget to add the last group
    if (currentGroup) {
      collapsedEvents.push({
        type: 'slot',
        status: currentGroup.status,
        title: status === 'free' ? 'Available' : 'Blocked',
        start: currentGroup.start,
        end: currentGroup.end,
        resource: {
          status,
        },
      });
    }
  });

  return collapsedEvents;
}

function appointmentsToEvents(appointments: Appointment[]): AppointmentEvent[] {
  return appointments
    .filter((appointment) => appointment.status !== 'cancelled')
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment?.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status as string)
        ? ` (${appointment.status})`
        : '';

      return {
        type: 'appointment',
        appointment,
        title: `${patientParticipant?.actor?.display} ${status}`,
        start: new Date(appointment.start as string),
        end: new Date(appointment.end as string),
        resource: appointment,
      };
    });
}

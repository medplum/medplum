import { Box, Button, Group, Title } from '@mantine/core';
import { useDisclosure, usePrevious } from '@mantine/hooks';
import { createReference, getReferenceString } from '@medplum/core';
import { Appointment, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useNavigate } from 'react-router';
import { BlockAvailability } from '../components/schedule/BlockAvailability';
import { CreateAppointment } from '../components/schedule/CreateAppointment';
import { CreateUpdateSlot } from '../components/schedule/CreateUpdateSlot';
import { SetAvailability } from '../components/schedule/SetAvailability';
import { SlotDetails } from '../components/schedule/SlotDetails';

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to set availability, block availability, create/update slots, and create
 * appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();

  const [schedule, setSchedule] = useState<Schedule | undefined>();
  const [blockAvailabilityOpened, blockAvailabilityHandlers] = useDisclosure(false);
  const [setAvailabilityOpened, setAvailabilityHandlers] = useDisclosure(false);
  const [slotDetailsOpened, slotDetailsHandlers] = useDisclosure(false);
  const [createUpdateSlotOpened, createUpdateSlotHandlers] = useDisclosure(false);
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);

  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const profile = useMedplumProfile() as Practitioner;

  const prevSchedule = usePrevious(schedule);
  const prevProfile = usePrevious(profile);

  const [shouldRefreshCalender, setShouldRefreshCalender] = useState(true);

  const [slots, setSlots] = useState<Slot[]>();
  const [appointments, setAppointments] = useState<Appointment[]>();

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
            .catch((err) => {
              console.log(err);
            });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }, [medplum, profile]);

  useEffect(() => {
    if ((schedule && prevSchedule?.id !== schedule?.id) || (profile && prevProfile?.id !== profile?.id)) {
      setShouldRefreshCalender(true);
    }
  }, [schedule, profile, prevSchedule?.id, prevProfile?.id]);

  useEffect(() => {
    async function searchSlots(): Promise<void> {
      const slots = await medplum.searchResources(
        'Slot',
        {
          schedule: getReferenceString(schedule as Schedule),
          _count: '100',
        },
        { cache: 'no-cache' }
      );
      setSlots(slots);
    }

    async function searchAppointments(): Promise<void> {
      const appointments = await medplum.searchResources(
        'Appointment',
        {
          actor: getReferenceString(profile as Practitioner),
        },
        { cache: 'no-cache' }
      );
      setAppointments(appointments);
    }

    if (shouldRefreshCalender) {
      Promise.allSettled([searchSlots(), searchAppointments()])
        .then(() => setShouldRefreshCalender(false))
        .catch(console.error);
    }
  }, [medplum, schedule, profile, shouldRefreshCalender]);

  // Converts Slot resources to big-calendar Event objects
  // Only show free and busy-unavailable slots
  const slotEvents: Event[] = (slots ?? [])
    .filter((slot) => slot.status === 'free' || slot.status === 'busy-unavailable')
    .map((slot) => ({
      title: slot.status === 'free' ? 'Available' : 'Blocked',
      start: new Date(slot.start),
      end: new Date(slot.end),
      resource: slot,
    }));

  // Converts Appointment resources to big-calendar Event objects
  // Exclude cancelled appointments to prevent them from overlapping free slots during rendering
  const appointmentEvents: Event[] = (appointments ?? [])
    .filter((appointment) => appointment.status !== 'cancelled')
    .map((appointment) => {
      // Find the patient among the participants to use as title
      const patientParticipant = appointment?.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));
      const status = !['booked', 'arrived', 'fulfilled'].includes(appointment.status as string)
        ? ` (${appointment.status})`
        : '';

      return {
        title: `${patientParticipant?.actor?.display} ${status}`,
        start: new Date(appointment.start as string),
        end: new Date(appointment.end as string),
        resource: appointment,
      };
    });

  /**
   * When a date/time range is selected, set the event object and open the create slot modal
   */
  const handleSelectSlot = useCallback(
    (event: Event & { action?: string }) => {
      console.log('CODY', event.action, event);
      if (event.action !== 'select') {
        return;
      }
      setSelectedEvent(event);
      createUpdateSlotHandlers.open();
    },
    [createUpdateSlotHandlers]
  );

  /**
   * When an existing event (slot/appointment) is selected, set the event object and open the
   * appropriate modal.
   * - If the event is a free slot, open the create appointment modal.
   * - If the event is a busy-unavailable slot, open the slot details modal.
   * - If the event is an appointment, navigate to the appointment page.
   */
  const handleSelectEvent = useCallback(
    (event: Event) => {
      const { resourceType, status, id } = event.resource;

      function handleSlot(): void {
        setSelectedEvent(event);
        if (status === 'free') {
          createAppointmentHandlers.open();
        } else {
          slotDetailsHandlers.open();
        }
      }

      function handleAppointment(): void {
        navigate(`/Appointment/${id}`)?.catch(console.error);
      }

      if (resourceType === 'Slot') {
        handleSlot();
        return;
      }

      if (resourceType === 'Appointment') {
        handleAppointment();
      }
    },
    [slotDetailsHandlers, createAppointmentHandlers, navigate]
  );

  if (!schedule) {
    return null;
  }

  const height = window.innerHeight - 60;

  return (
    <Box pos="relative" bg="white" p="md" style={{ height }}>
      <Title order={1} mb="lg">
        My Schedule
      </Title>

      <Group mb="lg">
        <Button size="sm" onClick={() => setAvailabilityHandlers.open()}>
          Set Availability
        </Button>
        <Button size="sm" onClick={() => blockAvailabilityHandlers.open()}>
          Block Availability
        </Button>
      </Group>

      <Calendar
        defaultView="week"
        views={['month', 'week', 'day', 'agenda']}
        localizer={dayjsLocalizer(dayjs)}
        events={appointmentEvents}
        backgroundEvents={slotEvents} // Background events don't show in the month view
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        scrollToTime={new Date()} // Default scroll to current time
        style={{ height: height - 150 }}
        selectable
      />

      {/* Modals */}
      <SetAvailability schedule={schedule} opened={setAvailabilityOpened} handlers={setAvailabilityHandlers} />
      <BlockAvailability schedule={schedule} opened={blockAvailabilityOpened} handlers={blockAvailabilityHandlers} />
      <CreateUpdateSlot
        schedule={schedule}
        event={selectedEvent}
        opened={createUpdateSlotOpened}
        handlers={createUpdateSlotHandlers}
        onSlotsUpdated={() => setShouldRefreshCalender(true)}
      />
      <SlotDetails
        schedule={schedule}
        event={selectedEvent}
        opened={slotDetailsOpened}
        handlers={slotDetailsHandlers}
        onSlotsUpdated={() => setShouldRefreshCalender(true)}
      />
      <CreateAppointment
        schedule={schedule}
        event={selectedEvent}
        opened={createAppointmentOpened}
        handlers={createAppointmentHandlers}
        onAppointmentsUpdated={() => setShouldRefreshCalender(true)}
      />
    </Box>
  );
}

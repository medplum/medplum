import { Button, Group, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getReferenceString } from '@medplum/core';
import { Practitioner, Schedule } from '@medplum/fhirtypes';
import { Document, useMedplumProfile, useSearchResources } from '@medplum/react';
import dayjs from 'dayjs';
import { useCallback, useContext, useState } from 'react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useNavigate } from 'react-router-dom';
import { BlockAvailability } from '../components/actions/BlockAvailability';
import { CreateAppointment } from '../components/actions/CreateAppointment';
import { CreateUpdateSlot } from '../components/actions/CreateUpdateSlot';
import { SetAvailability } from '../components/actions/SetAvailability';
import { SlotDetails } from '../components/SlotDetails';
import { ScheduleContext } from '../Schedule.context';

/**
 * Schedule page that displays the practitioner's schedule.
 * Allows the practitioner to set availability, block availability, create/update slots, and create
 * appointments.
 * @returns A React component that displays the schedule page.
 */
export function SchedulePage(): JSX.Element {
  const navigate = useNavigate();

  const [blockAvailabilityOpened, blockAvailabilityHandlers] = useDisclosure(false);
  const [setAvailabilityOpened, setAvailabilityHandlers] = useDisclosure(false);
  const [slotDetailsOpened, slotDetailsHandlers] = useDisclosure(false);
  const [createUpdateSlotOpened, createUpdateSlotHandlers] = useDisclosure(false);
  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);

  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const { schedule } = useContext(ScheduleContext);

  const profile = useMedplumProfile() as Practitioner;
  const [slots] = useSearchResources('Slot', { schedule: getReferenceString(schedule as Schedule), _count: '100' });
  const [appointments] = useSearchResources('Appointment', { actor: getReferenceString(profile as Practitioner) });

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
      if (event.action !== 'select') {
        return;
      }
      setSelectedEvent(event);
      createUpdateSlotHandlers.open();
    },
    [createUpdateSlotHandlers]
  );

  /**
   * When an exiting event (slot/appointment) is selected, set the event object and open the
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
        navigate(`/Appointment/${id}`);
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

  return (
    <Document width={1000}>
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
        style={{ height: 600 }}
        selectable
      />

      {/* Modals */}
      <SetAvailability opened={setAvailabilityOpened} handlers={setAvailabilityHandlers} />
      <BlockAvailability opened={blockAvailabilityOpened} handlers={blockAvailabilityHandlers} />
      <CreateUpdateSlot event={selectedEvent} opened={createUpdateSlotOpened} handlers={createUpdateSlotHandlers} />
      <SlotDetails event={selectedEvent} opened={slotDetailsOpened} handlers={slotDetailsHandlers} />
      <CreateAppointment event={selectedEvent} opened={createAppointmentOpened} handlers={createAppointmentHandlers} />
    </Document>
  );
}

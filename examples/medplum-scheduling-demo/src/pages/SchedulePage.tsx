import { useDisclosure } from '@mantine/hooks';
import { getReferenceString } from '@medplum/core';
import { Practitioner, Schedule } from '@medplum/fhirtypes';
import { Document, useMedplumProfile, useSearchResources } from '@medplum/react';
import dayjs from 'dayjs';
import { useCallback, useContext, useState } from 'react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useNavigate } from 'react-router-dom';
import { CreateUpdateSlot } from '../components/CreateUpdateSlot';
import { ScheduleContext } from '../Schedule.context';

export function SchedulePage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();
  const [createSlotOpened, createSlotHandlers] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const { schedule } = useContext(ScheduleContext);
  const [slots] = useSearchResources('Slot', { schedule: getReferenceString(schedule as Schedule) });
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
  const appointmentEvents: Event[] = (appointments ?? []).map((appointment) => {
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

  // When a slot is selected set the event object and open the modal
  const handleSelectSlot = useCallback(
    (event: Event) => {
      setSelectedEvent(event);
      createSlotHandlers.open();
    },
    [createSlotHandlers]
  );

  // When an exiting event is selected set the event object and open the modal
  const handleSelectEvent = useCallback(
    (event: Event) => {
      if (event.resource.resourceType === 'Slot') {
        // If it's a slot open the management modal
        setSelectedEvent(event);
        createSlotHandlers.open();
      } else if (event.resource.resourceType === 'Appointment') {
        // If it's an appointment navigate to the appointment detail page
        navigate(`/Appointment/${event.resource.id}`);
      }
    },
    [createSlotHandlers, navigate]
  );

  return (
    <Document width={1000}>
      <CreateUpdateSlot event={selectedEvent} opened={createSlotOpened} handlers={createSlotHandlers} />
      <Calendar
        defaultView="week"
        localizer={dayjsLocalizer(dayjs)}
        events={appointmentEvents}
        backgroundEvents={slotEvents} // Background events don't show in the month view
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        style={{ height: 600 }}
        selectable
      />
    </Document>
  );
}

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
import { Title } from '@mantine/core';
import { CreateAppointment } from '../components/CreateAppointment';

interface OnClickEventModalProps {
  event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

// This helper component manage the modal to be shown when an event is clicked
function OnClickEventModal(props: OnClickEventModalProps): JSX.Element {
  const { event, opened, handlers } = props;

  // If the event is a free slot (available for booking), show the appointment creation modal
  if (event?.resource?.resourceType === 'Slot' && event?.resource?.status === 'free') {
    return <CreateAppointment slot={event.resource} opened={opened} handlers={handlers} />;
  }

  // If the event is a busy-unavailable slot (blocked for booking) or if the event is a range
  // selection, show the slot management modal
  return <CreateUpdateSlot event={event} opened={opened} handlers={handlers} />;
}

export function SchedulePage(): JSX.Element {
  const navigate = useNavigate();
  const [modalOpened, modalHandlers] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const { schedule } = useContext(ScheduleContext);

  const profile = useMedplumProfile() as Practitioner;
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

  // When a date/time range is selected, set the event object and open the modal
  const handleSelectSlot = useCallback(
    (event: Event) => {
      setSelectedEvent(event);
      modalHandlers.open();
    },
    [modalHandlers]
  );

  // When an exiting event is selected, set the event object and open the modal
  const handleSelectEvent = useCallback(
    (event: Event) => {
      if (event.resource.resourceType === 'Slot') {
        // If it's a slot open the management modal
        setSelectedEvent(event);
        modalHandlers.open();
      } else if (event.resource.resourceType === 'Appointment') {
        // If it's an appointment navigate to the appointment detail page
        navigate(`/Appointment/${event.resource.id}`);
      }
    },
    [modalHandlers, navigate]
  );

  return (
    <Document width={1000}>
      <Title order={1} mb="lg">
        My Schedule
      </Title>

      <OnClickEventModal event={selectedEvent} opened={modalOpened} handlers={modalHandlers} />

      <Calendar
        defaultView="week"
        views={['month', 'week', 'day', 'agenda']}
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

import { useDisclosure } from '@mantine/hooks';
import { getReferenceString } from '@medplum/core';
import { Schedule } from '@medplum/fhirtypes';
import { Document, Loading, useMedplum, useSearchResources } from '@medplum/react';
import dayjs from 'dayjs';
import { useCallback, useContext, useState } from 'react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useParams } from 'react-router-dom';
import { ScheduleContext } from '../Schedule.context';
import { Title } from '@mantine/core';
import { CreateAppointment } from '../components/CreateAppointment';

export function PatientSchedulePage(): JSX.Element {
  const { patientId } = useParams();

  const [createAppointmentOpened, createAppointmentHandlers] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const { schedule } = useContext(ScheduleContext);

  const medplum = useMedplum();
  const [slots] = useSearchResources('Slot', { schedule: getReferenceString(schedule as Schedule) });
  const patient = patientId ? medplum.readResource('Patient', patientId).read() : undefined;

  // Converts Slot resources to big-calendar Event objects
  // Only show free slots (available for booking)
  const slotEvents: Event[] = (slots ?? [])
    .filter((slot) => slot.status === 'free')
    .map((slot) => ({
      title: slot.status === 'free' ? 'Available' : 'Blocked',
      start: new Date(slot.start),
      end: new Date(slot.end),
      resource: slot,
    }));

  // When an exiting event (slot) is selected, set the event object and open the modal
  const handleSelectEvent = useCallback(
    (event: Event) => {
      setSelectedEvent(event);
      createAppointmentHandlers.open();
    },
    [createAppointmentHandlers]
  );

  if (!patientId) {
    return <Loading />;
  }

  return (
    <Document width={1000}>
      <Title order={1} mb="lg">
        Select a slot for the appointment
      </Title>

      <CreateAppointment
        patient={patient}
        slot={selectedEvent?.resource}
        opened={createAppointmentOpened}
        handlers={createAppointmentHandlers}
      />

      <Calendar
        defaultView="week"
        views={['week', 'day']}
        localizer={dayjsLocalizer(dayjs)}
        backgroundEvents={slotEvents} // Background events don't show in the month view
        onSelectEvent={handleSelectEvent}
        style={{ height: 600 }}
      />
    </Document>
  );
}

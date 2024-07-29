import { Document, useSearchResources } from '@medplum/react';
import { Calendar, dayjsLocalizer, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useCallback, useContext, useState } from 'react';
import dayjs from 'dayjs';
import { CreateUpdateSlot } from '../components/CreateUpdateSlot';
import { useDisclosure } from '@mantine/hooks';
import { ScheduleContext } from '../Schedule.context';
import { getReferenceString } from '@medplum/core';
import { Schedule } from '@medplum/fhirtypes';

export function SchedulePage(): JSX.Element {
  const [createSlotOpened, createSlotHandlers] = useDisclosure(false);
  const [selectedEvent, setSelectedEvent] = useState<Event>();
  const { schedule } = useContext(ScheduleContext);
  const [slots] = useSearchResources('Slot', { schedule: getReferenceString(schedule as Schedule) });

  // Converts Slot resources to big-calendar Event objects
  const events: Event[] = (slots ?? []).map((slot) => ({
    title: 'Available',
    start: new Date(slot.start),
    end: new Date(slot.end),
    resource: slot,
  }));

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
      setSelectedEvent(event);
      createSlotHandlers.open();
    },
    [createSlotHandlers]
  );

  return (
    <Document width={1000}>
      <CreateUpdateSlot event={selectedEvent} opened={createSlotOpened} handlers={createSlotHandlers} />
      <Calendar
        localizer={dayjsLocalizer(dayjs)}
        events={events}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        style={{ height: 600 }}
        selectable
      />
    </Document>
  );
}

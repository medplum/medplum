import { Document, useSearchResources } from '@medplum/react';
import { Calendar, dayjsLocalizer, SlotInfo } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useCallback, useContext, useState } from 'react';
import dayjs from 'dayjs';
import { CreateSlot } from '../components/CreateSlot';
import { useDisclosure } from '@mantine/hooks';
import { ScheduleContext } from '../Schedule.context';
import { getReferenceString } from '@medplum/core';
import { Schedule } from '@medplum/fhirtypes';

export function SchedulePage(): JSX.Element {
  const [createSlotOpened, createSlotHandlers] = useDisclosure(false);
  const [[start, end], setStartEnd] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const { schedule } = useContext(ScheduleContext);
  const [slots] = useSearchResources('Slot', { schedule: getReferenceString(schedule as Schedule) });

  const events = (slots ?? []).map((slot) => ({
    title: 'Available',
    start: new Date(slot.start),
    end: new Date(slot.end),
  }));

  const handleSelectSlot = useCallback(
    ({ start, end }: SlotInfo) => {
      setStartEnd([start.toISOString(), end.toISOString()]);
      createSlotHandlers.open();
    },
    [createSlotHandlers]
  );

  return (
    <Document width={1000}>
      <CreateSlot start={start} end={end} opened={createSlotOpened} handlers={createSlotHandlers} />
      <Calendar
        localizer={dayjsLocalizer(dayjs)}
        events={events}
        style={{ height: 600 }}
        onSelectSlot={handleSelectSlot}
        selectable
      />
    </Document>
  );
}

import { Document } from '@medplum/react';
import { Calendar, dayjsLocalizer, SlotInfo } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { CreateSlot } from '../components/CreateSlot';
import { useDisclosure } from '@mantine/hooks';

export function SchedulePage(): JSX.Element {
  const [createSlotOpened, createSlotHandlers] = useDisclosure(false);
  const [[start, end], setStartEnd] = useState<[string | undefined, string | undefined]>([undefined, undefined]);

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
      <Calendar localizer={dayjsLocalizer(dayjs)} style={{ height: 600 }} onSelectSlot={handleSelectSlot} selectable />
    </Document>
  );
}

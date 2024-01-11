import { Slot } from '@medplum/fhirtypes';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { CalendarInput } from './CalendarInput';
import { withMockedDate } from '../stories/decorators';

export default {
  title: 'Medplum/CalendarInput',
  component: CalendarInput,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  const start = new Date();
  const end = new Date(start);
  end.setHours(start.getHours() + 1);
  return (
    <Document>
      <CalendarInput
        slots={
          [
            {
              resourceType: 'Slot',
              schedule: {
                reference: 'Schedule/example',
              },
              status: 'free',
              start: start.toISOString(),
              end: end.toISOString(),
            },
          ] as Slot[]
        }
        onChangeMonth={(date: Date) => console.log(date)}
        onClick={(date: Date) => console.log('Clicked ' + date)}
      />
    </Document>
  );
};

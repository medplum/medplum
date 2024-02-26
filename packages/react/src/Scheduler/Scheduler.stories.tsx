import { DrAliceSmithSchedule, ExampleQuestionnaire } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { withMockedDate } from '../stories/decorators';
import { Scheduler } from './Scheduler';

export default {
  title: 'Medplum/Scheduler',
  component: Scheduler,
  decorators: [withMockedDate],
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <Document>
      <Scheduler schedule={DrAliceSmithSchedule} questionnaire={ExampleQuestionnaire} />
    </Document>
  );
};

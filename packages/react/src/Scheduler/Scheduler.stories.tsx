import { DrAliceSmithSchedule, ExampleQuestionnaire } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { Scheduler } from './Scheduler';

export default {
  title: 'Medplum/Scheduler',
  component: Scheduler,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <Scheduler schedule={DrAliceSmithSchedule} questionnaire={ExampleQuestionnaire} />
  </Document>
);

import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { PatientTimeline } from './PatientTimeline';

export default {
  title: 'Medplum/PatientTimeline',
  component: PatientTimeline,
} as Meta;

export const Patient = (): JSX.Element => <PatientTimeline patient={HomerSimpson} />;

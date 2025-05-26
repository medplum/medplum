import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { PatientSummary } from './PatientSummary';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
} as Meta;

export const Patient = (): JSX.Element => <PatientSummary patient={HomerSimpson} />;
